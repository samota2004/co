import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { audit, userScope } from './security-common.js';
import { DEFAULT_CONFIG, validateConfig, validateEvent, validateHealth, validateEnrollment } from '../../agent/shared/contract.js';
import {cityLookup,cityView} from './endpoint-city.js';
import {coreDeviceSelect,cityDeviceSelect,citySchemaReady,withCitySchema,invalidateCitySchema,isMissingCityColumn} from './endpoint-city-schema.js';
import {reportCityAddress} from './proxy-policy.js';
import {createLiveModelDataReadiness,parseReadinessDate} from './ml-data-readiness.js';
import {featureSchema} from './ml-service.js';
import {validateUsbPolicy,signUsbPolicyCommand} from '../../agent/src/usb-policy.js';
import {signAccountControlCommand} from '../../agent/src/account-control.js';
import {LOCAL_OPERATION_ACTIONS,signLocalOperationGrant} from '../../agent/src/local-operation-auth.js';
import {broadcastSecurityNotifications,createContainmentNotifications} from './security-notification-service.js';
export const hashSecret = s => createHash('sha256').update(s).digest('hex');
export const isEndpointAdmin = u => ['SECURITY_ADMIN', 'SYSTEM_ADMIN'].includes(u.roleCode);
export const ML_AVAILABILITY = Object.freeze({ available: false,
  reason: 'The trained model requires complete 21-feature CERT user-day logon/device/file/HTTP/email coverage. File changes are not reads; connections are not HTTP history. Email/content features and training preprocessing are unavailable. No endpoint inference is performed.' });
const endpointMonitoringUser = user => {
  if (!user) return null;
  const { _count, ...record } = user;
  const riskAssessed = Boolean(_count?.riskScores);
  const trustAssessed = Boolean(user.trustUpdatedAt);
  return { ...record, ...(!riskAssessed ? { riskScore: null, riskLevel: null } : {}), ...(!trustAssessed ? { trustScore: null } : {}), assessmentStatus: riskAssessed || trustAssessed ? 'ASSESSED' : 'NOT_ASSESSED' };
};
const hasFreshAgentContact = (device,now) => {
  const contact=device.platform==='win32'?device.health?.lastHeartbeatAt:device.lastSeen;
  const time=Date.parse(contact||'');
  return Number.isFinite(time)&&now.getTime()-time<=5*60*1000;
};
const endpointAssignmentActive=device=>Boolean(
  device?.enrolledAt && device.user && device.user.companyId===device.companyId &&
  device.user.deletedAt===null && ['EMPLOYEE','MANAGER'].includes(device.user.roleCode) &&
  ['ACTIVE','RESTRICTED','FROZEN'].includes(device.user.status)
);
const usbHardwareId=event=>typeof event?.metadata?.hardwareId==='string'?event.metadata.hardwareId:'';
export class EndpointError extends Error {
  constructor(status, message, code = 'ENDPOINT_REJECTED', diagnostics = {}) {
    super(message); this.name = 'EndpointError'; this.status = status; this.code = code;
    this.field = diagnostics.field; this.reason = diagnostics.reason;
  }
}
export class EndpointService {
  constructor(prisma,locator=cityLookup) { this.prisma = prisma; this.locator=locator; }
  async assign(admin, body) {
    if (!isEndpointAdmin(admin)) throw new EndpointError(403, 'Administrator required');
    const { userId, name, platform, mappedIdentity, deviceId, issueEnrollmentToken = true } = body;
    if (typeof userId !== 'string' || !userId.trim() || userId.length > 128) throw new EndpointError(400, 'Select an employee');
    if (typeof issueEnrollmentToken !== 'boolean') throw new EndpointError(400, 'Invalid token issuance option');
    if (deviceId !== undefined && (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId))) throw new EndpointError(400, 'Select a valid device');
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || !['win32','linux','darwin'].includes(platform)) throw new EndpointError(400, 'Invalid device assignment');
    if (mappedIdentity && (typeof mappedIdentity !== 'string' || !(platform === 'win32' ? /^S-1-5-(\d+-)*\d+$/ : /^uid:\d+$/).test(mappedIdentity))) throw new EndpointError(400, 'Use verified Windows SID or uid:number');
    const employee = await this.prisma.user.findFirst({ where: { id: userId, ...userScope(admin), status: 'ACTIVE', roleCode: { in: ['EMPLOYEE','MANAGER'] } } });
    if (!employee) throw new EndpointError(404, 'Employee not found in company');
    let config;
    if (body.config !== undefined || !deviceId) {
      try { config = validateConfig(body.config || DEFAULT_CONFIG); } catch (e) { throw new EndpointError(400, e.message); }
    }
    // Preserve the original combined API for existing agent callers. The UI explicitly
    // requests assignment only, then issues a token for that persisted device.
    const token = issueEnrollmentToken ? randomBytes(32).toString('base64url') : null;
    const expiresAt = token ? new Date(Date.now() + 15 * 60000) : null;
    const values = { userId: employee.id, name: name.trim(), platform,
      mappedIdentity: mappedIdentity || null, ...(config ? { config } : {}),
      enrollmentHash: token ? hashSecret(token) : null, enrollmentExpiresAt: expiresAt };
    let device;
    if (deviceId) {
      device = await this.prisma.$transaction(async tx => {
        const existing = await tx.endpointDevice.findFirst({ where: { id: deviceId, companyId: admin.companyId, user: userScope(admin) },select:coreDeviceSelect });
        if (!existing) throw new EndpointError(404, 'Device not found in company');
        if (existing.revokedAt || existing.enrolledAt) throw new EndpointError(409, 'An enrolled or revoked laptop cannot be reassigned. Revoke and create a new enrollment record.');
        if (existing.platform !== platform) throw new EndpointError(400, 'Selected device platform does not match');
        const result = await tx.endpointDevice.updateMany({ where: { id: deviceId, companyId: admin.companyId, user: userScope(admin), enrolledAt: null, revokedAt: null }, data: values });
        if (result.count !== 1) throw new EndpointError(409, 'Device changed during assignment. Refresh and try again.');
        return { ...existing, ...values };
      });
    } else {
      if(typeof this.prisma.$queryRaw==='function'&&!await citySchemaReady(this.prisma)) {
        // Prisma also supplies client-side defaults in INSERT statements, even
        // with a restricted select. Omit the optional columns completely while
        // the additive migration is pending. Scope/employee validation above and
        // the database FK constraints still apply; all values are parameters.
        const id=randomUUID();
        [device]=await this.prisma.$queryRaw`INSERT INTO endpoint_devices
          (id,"companyId","userId",name,platform,"mappedIdentity",config,"enrollmentHash","enrollmentExpiresAt")
          VALUES (${id},${admin.companyId},${values.userId},${values.name},${platform},${values.mappedIdentity},${JSON.stringify(values.config)}::jsonb,${values.enrollmentHash},${values.enrollmentExpiresAt})
          RETURNING id,name`;
      } else device = await this.prisma.endpointDevice.create({ data: { companyId: admin.companyId, ...values },select:coreDeviceSelect });
    }
    return { deviceId: device.id, userId: employee.id, name: device.name,
      ...(token ? { enrollmentToken: token, expiresAt } : {}) };
  }
  async issueEnrollmentToken(admin, deviceId) {
    if (!isEndpointAdmin(admin)) throw new EndpointError(403, 'Administrator required');
    if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) throw new EndpointError(400, 'Select an assigned device');
    const token = randomBytes(32).toString('base64url'), expiresAt = new Date(Date.now() + 15 * 60000);
    return this.prisma.$transaction(async tx => {
      const device = await tx.endpointDevice.findFirst({ where: { id: deviceId, companyId: admin.companyId, user: userScope(admin) },select:{...coreDeviceSelect,user:true} });
      if (!device) throw new EndpointError(404, 'Device not found in company');
      if (device.revokedAt || device.enrolledAt) throw new EndpointError(409, 'Device is already enrolled or revoked; a new enrollment token cannot be issued.');
      if (!device.user || device.user.companyId !== admin.companyId || device.user.status !== 'ACTIVE' || !['EMPLOYEE','MANAGER'].includes(device.user.roleCode)) throw new EndpointError(409, 'Assign the device to an active employee in your company first.');
      const result = await tx.endpointDevice.updateMany({ where: { id: deviceId, companyId: admin.companyId, user: userScope(admin), userId: device.userId, enrolledAt: null, revokedAt: null }, data: { enrollmentHash: hashSecret(token), enrollmentExpiresAt: expiresAt } });
      if (result.count !== 1) throw new EndpointError(409, 'Device changed during token issuance. Refresh and try again.');
      // Only the hash is stored. Issuing another token invalidates the previous one.
      return { deviceId, enrollmentToken: token, expiresAt };
    });
  }
  async enroll(body) {
    try { validateEnrollment(body); }
    catch (e) { throw new EndpointError(400, e.message, e.code, { field: e.field, reason: e.reason }); }
    const secret = randomBytes(32).toString('base64url');
    return this.prisma.$transaction(async tx => {
      const tokenHash = hashSecret(body.token);
      const device = await tx.endpointDevice.findFirst({ where: { enrollmentHash: tokenHash },select:{...coreDeviceSelect,user:true} });
      // A consumed/replaced/revoked token hash is erased. Do not retain token
      // history or weaken single-use checks just to distinguish these cases.
      if (!device) throw new EndpointError(401, 'Enrollment token is invalid, replaced, already used or revoked. Ask an administrator for a fresh token for an unenrolled device.', 'ENROLLMENT_TOKEN_UNAVAILABLE');
      if (device.revokedAt) throw new EndpointError(401, 'Device enrollment has been revoked. An administrator must create a new assignment.', 'ENROLLMENT_DEVICE_REVOKED');
      if (device.enrolledAt) throw new EndpointError(401, 'Enrollment token has already been used. Do not enroll this device again.', 'ENROLLMENT_TOKEN_USED');
      if (!device.enrollmentExpiresAt || new Date(device.enrollmentExpiresAt).getTime() <= Date.now()) throw new EndpointError(401, 'Enrollment token expired. Issue a fresh token and use it within 15 minutes.', 'ENROLLMENT_TOKEN_EXPIRED');
      if (device.platform !== body.platform) throw new EndpointError(400, 'Enrollment token belongs to a different operating system. Select an assignment matching this agent operating system.', 'ENROLLMENT_PLATFORM_MISMATCH', { field: 'platform', reason: 'assignment_mismatch' });
      if ((body.mappedIdentity!==undefined && body.mappedIdentity!==device.mappedIdentity) || (body.expectedDeviceId!==undefined && body.expectedDeviceId!==device.id)) throw new EndpointError(409,'The assigned device or macOS account does not match this installation. Ask the administrator to verify the assignment. The token was not consumed.','ENROLLMENT_IDENTITY_MISMATCH');
      if (!device.user || device.user.companyId !== device.companyId || device.user.status !== 'ACTIVE' || !['EMPLOYEE','MANAGER'].includes(device.user.roleCode)) throw new EndpointError(401, 'Device assignment is no longer valid for an active employee. Ask an administrator to review the assignment.', 'ENROLLMENT_ASSIGNMENT_INVALID');
      const where = { enrollmentHash: tokenHash, enrollmentExpiresAt: { gt: new Date() }, enrolledAt: null, revokedAt: null, platform: body.platform,
        userId: device.userId, companyId: device.companyId, mappedIdentity:device.mappedIdentity, user: { companyId: device.companyId, status: 'ACTIVE', roleCode: { in: ['EMPLOYEE','MANAGER'] } } };
      const changed = await tx.endpointDevice.updateMany({ where: { ...where, id: device.id }, data: {
        enrollmentHash: null, enrollmentExpiresAt: null, credentialHash: hashSecret(secret), enrolledAt: new Date(), agentVersion: body.agentVersion
      } });
      if (changed.count !== 1) throw new EndpointError(401, 'Enrollment was consumed, expired, revoked or changed during exchange. Refresh the device status before retrying.', 'ENROLLMENT_EXCHANGE_CONFLICT');
      return { deviceId: device.id, credential: secret, config: device.config, mappedIdentity: device.mappedIdentity };
    });
  }
  async authenticate(tx, secret, cityAvailable=false) {
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new EndpointError(401, 'Device authentication required');
    const d = await tx.endpointDevice.findFirst({ where: { credentialHash: hashSecret(secret), revokedAt: null },select:{...coreDeviceSelect,...(cityAvailable?cityDeviceSelect:{}),user:true} });
    if (!d || !endpointAssignmentActive(d)) throw new EndpointError(401, 'Endpoint credential is invalid, revoked, unassigned, or no longer mapped to an active employee.', 'ENDPOINT_ASSIGNMENT_INVALID');
    return d;
  }
  async ingest(secret, body) {
    if (!Array.isArray(body.events) || !body.events.length || body.events.length > 100 || Buffer.byteLength(JSON.stringify(body)) > 262144) throw new EndpointError(400, 'Batch limit exceeded');
    try { body.events.forEach(e => validateEvent(e)); } catch (e) { throw new EndpointError(400, e.message); }
    return this.prisma.$transaction(async tx => {
      const d = await this.authenticate(tx, secret);
      if (body.events.some(e => e.deviceId !== d.id)) throw new EndpointError(403, 'Device mismatch');
      // Locks device row; revocation cannot race past durable acceptance.
      const touched = await tx.endpointDevice.updateMany({ where: { id: d.id, credentialHash: hashSecret(secret), revokedAt: null }, data: { lastSeen: new Date() } });
      if (touched.count !== 1) throw new EndpointError(401, 'Revoked credential');
      // The queue retries the original event IDs. Collapse duplicate IDs in a
      // single request and only create alerts for rows absent before this
      // authenticated device transaction acquired its device-row lock.
      const uniqueEvents=[...new Map(body.events.map(event=>[event.eventId,event])).values()];
      const existing=uniqueEvents.length?await tx.endpointEvent.findMany({where:{deviceId:d.id,eventId:{in:uniqueEvents.map(event=>event.eventId)}},select:{eventId:true}}):[];
      const existingIds=new Set(existing.map(event=>event.eventId));
      const acceptedEvents=uniqueEvents.filter(event=>!existingIds.has(event.eventId));
      const records = acceptedEvents.map(e => ({ ...e, occurredAt: new Date(e.occurredAt), companyId: d.companyId,
        // Device-wide observations intentionally have no employee attribution.
        userId: (/^(PROCESS_|APPLICATION_|SESSION_)/.test(e.type) || e.type==='FILE_CHANGE') && d.mappedIdentity && e.metadata.identity === d.mappedIdentity ? d.userId : null }));
      if(records.length)await tx.endpointEvent.createMany({ data: records, skipDuplicates: true });
      const notifications=[];
      const usbConnections=acceptedEvents.filter(event=>event.type==='USB_CONNECTED');
      if(usbConnections.length&&tx.securityNotification){
        const recipients=await tx.user.findMany({where:{companyId:d.companyId,deletedAt:null,status:'ACTIVE',roleCode:{in:['SECURITY_ADMIN','SYSTEM_ADMIN']},OR:[{isMainAdmin:true},...(d.user.assignedAdminId?[{id:d.user.assignedAdminId}]:[])]},select:{id:true}});
        // A transient snapshot failure can make the same attached device look
        // new again and create a new UUID. Treat a subsequent CONNECTED for
        // the same hardware as a retry until a validated REMOVED event occurs.
        // Read the most recent state window, then restore chronological order
        // before reducing it.  Reading the oldest 1,000 rows would let an old
        // connection hide a later removal on long-lived endpoints.
        const priorUsb=(await tx.endpointEvent.findMany({where:{deviceId:d.id,type:{in:['USB_CONNECTED','USB_REMOVED']},eventId:{notIn:acceptedEvents.map(event=>event.eventId)}},select:{type:true,occurredAt:true,metadata:true},orderBy:{occurredAt:'desc'},take:1000})).reverse();
        const state=new Map(priorUsb.filter(event=>usbHardwareId(event)).map(event=>[usbHardwareId(event),event.type]));
        const ordered=[...acceptedEvents].filter(event=>event.type==='USB_CONNECTED'||event.type==='USB_REMOVED').sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.eventId.localeCompare(b.eventId));
        for(const event of ordered){
          const hardwareId=usbHardwareId(event);if(!hardwareId)continue;
          if(event.type==='USB_REMOVED'){state.set(hardwareId,'USB_REMOVED');continue;}
          const alreadyConnected=state.get(hardwareId)==='USB_CONNECTED';state.set(hardwareId,'USB_CONNECTED');
          if(alreadyConnected)continue;
          const dedupeKey=`endpoint-usb:${d.id}:${event.eventId}`;
          const created=recipients.length?await tx.securityNotification.createMany({data:recipients.map(recipient=>({
            companyId:d.companyId,recipientId:recipient.id,targetUserId:null,dedupeKey,
            type:'ENDPOINT_USB_CONNECTED',severity:'MEDIUM',title:'USB device connection observed',
            message:`A USB device connection was observed on enrolled endpoint "${d.name}". Connection does not confirm storage access, file access, or data transfer.`,
            metadata:{deviceId:d.id,deviceName:d.name,eventId:event.eventId,eventType:event.type,observedAt:event.occurredAt,category:event.metadata.category||'OTHER'}
          })),skipDuplicates:true}):{count:0};
          if(created.count)notifications.push(...await tx.securityNotification.findMany({where:{companyId:d.companyId,dedupeKey,recipientId:{in:recipients.map(recipient=>recipient.id)}}}));
        }
      }
      return { acceptedEventIds: uniqueEvents.map(e => e.eventId), companyId: d.companyId, userId: d.userId, deviceId: d.id, notifications };
    });
  }
  async heartbeat(secret, body, address, addressDiagnostics) {
    try { validateHealth(body.health); } catch (e) { throw new EndpointError(400, e.message); }
    if (typeof body.agentVersion !== 'string' || body.agentVersion.length > 40) throw new EndpointError(400, 'Invalid version');
    const report=body.accountControlReport;
    if(report!==undefined&&(!report||typeof report!=='object'||Array.isArray(report)||Object.keys(report).some(key=>!['commandId','resultCode','reportedAt'].includes(key))||typeof report.commandId!=='string'||report.commandId.length>80||typeof report.resultCode!=='string'||!['BLOCKED','ALLOWED','LOGOFF_PENDING','EXTERNALLY_DISABLED','RECOVERY_REQUIRED','UNSAFE_ACCOUNT','UNSAFE_RECOVERY','UNSUPPORTED_MACHINE','UNSAFE_STORAGE','ACCESS_DENIED','NATIVE_ERROR','CONTROL_DISABLED','CONTROL_REFUSED','NEEDS_REVIEW'].includes(report.resultCode)||!Number.isFinite(Date.parse(report.reportedAt))||Date.parse(report.reportedAt)>Date.now()+60000))throw new EndpointError(400,'Invalid account-control acknowledgement');
    const stopReport=body.agentCommandReport;
    if(stopReport!==undefined&&(!stopReport||typeof stopReport!=='object'||Array.isArray(stopReport)||Object.keys(stopReport).some(key=>!['commandId','resultCode','reportedAt'].includes(key))||typeof stopReport.commandId!=='string'||!/^[0-9a-f-]{36}$/i.test(stopReport.commandId)||!['STOP_ACCEPTED','START_ACCEPTED'].includes(stopReport.resultCode)||!Number.isFinite(Date.parse(stopReport.reportedAt))||Date.parse(stopReport.reportedAt)>Date.now()+30000))throw new EndpointError(400,'Invalid agent-command acknowledgement');
    const localReport=body.localOperationReport;
    if(localReport!==undefined&&(!localReport||typeof localReport!=='object'||Array.isArray(localReport)||Object.keys(localReport).sort().join('|')!=='nonce|reportedAt|requestId|resultCode'||typeof localReport.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(localReport.requestId)||typeof localReport.nonce!=='string'||!/^[0-9a-f-]{36}$/i.test(localReport.nonce)||!['GRANT_ACCEPTED','UNINSTALL_SCHEDULED','UNINSTALL_SCHEDULE_FAILED'].includes(localReport.resultCode)||!Number.isFinite(Date.parse(localReport.reportedAt))||Date.parse(localReport.reportedAt)>Date.now()+30000))throw new EndpointError(400,'Invalid local operation acknowledgement');
    const result=await withCitySchema(this.prisma,cityAvailable=>this.prisma.$transaction(async tx => {
      const d = await this.authenticate(tx, secret,cityAvailable);
      const observedAt=new Date();
      // lastSeen remains the latest received event/heartbeat compatibility field.
      // A server-stamped heartbeat time is stored separately so delayed queued
      // event uploads cannot make an offline service look connected.
      const reportedHealth={...body.health,lastHeartbeatAt:observedAt.toISOString()};
      const changed = await tx.endpointDevice.updateMany({ where: { id: d.id, credentialHash: hashSecret(secret), revokedAt: null }, data: { lastSeen: observedAt, agentVersion: body.agentVersion, health: reportedHealth,
        ...(d.ipCityEnabled?{ipCityGeneration:{increment:1}}:{}) } });
      if (changed.count !== 1) throw new EndpointError(401, 'Revoked credential');
      const generation=d.ipCityEnabled?(await tx.endpointDevice.findUnique({where:{id:d.id},select:{ipCityGeneration:true}})).ipCityGeneration:null;
      const enforcement=tx.endpointEnforcementCommand;
      let accountControlAck=null;
      let accountStatus=d.user.status;
      const notifications=[];
      if(enforcement)await enforcement.updateMany({where:{deviceId:d.id,action:{in:['BLOCK','ALLOW']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{lte:observedAt}},data:{status:'EXPIRED',resultCode:'COMMAND_EXPIRED'}});
      // Only the authenticated enrollment's employee determines the OS target.
      // Keep device credentials valid while frozen so an administrator can restore access.
      if(report&&enforcement){
        const command=await enforcement.findUnique({where:{commandId:report.commandId}});
        if(command&&command.deviceId===d.id&&command.userId===d.userId&&command.companyId===d.companyId&&command.status==='SUCCEEDED'&&((command.action==='BLOCK'&&report.resultCode==='BLOCKED')||(command.action==='ALLOW'&&report.resultCode==='ALLOWED'))){accountControlAck=command.commandId;}
        else if(command&&command.deviceId===d.id&&command.userId===d.userId&&command.companyId===d.companyId&&['PENDING','PENDING_OFFLINE'].includes(command.status)&&command.expiresAt&&command.expiresAt>observedAt&&Date.parse(report.reportedAt)>=command.issuedAt.getTime()){
          const success=(command.action==='BLOCK'&&report.resultCode==='BLOCKED')||(command.action==='ALLOW'&&report.resultCode==='ALLOWED');
          const pending=report.resultCode==='LOGOFF_PENDING';
          const unsupported=['UNSUPPORTED_MACHINE','UNSAFE_STORAGE','CONTROL_DISABLED'].includes(report.resultCode);
          await enforcement.update({where:{id:command.id},data:{resultCode:report.resultCode,status:success?'SUCCEEDED':pending?'PENDING':unsupported?'UNSUPPORTED':'FAILED',acknowledgedAt:new Date(report.reportedAt)}});
          accountControlAck=command.commandId;
          if(success&&command.action==='BLOCK'){
            const targets=await tx.endpointDevice.findMany({where:{companyId:d.companyId,userId:d.userId,revokedAt:null,platform:'win32',mappedIdentity:{not:null},enforcementCommands:{some:{action:'BLOCK'}}},select:{id:true}});
            const states=await Promise.all(targets.map(target=>enforcement.findFirst({where:{deviceId:target.id,userId:d.userId,action:'BLOCK'},orderBy:{createdAt:'desc'}})));
            if(targets.length&&states.every(item=>item?.status==='SUCCEEDED')){const changed=await tx.user.updateMany({where:{id:d.userId,companyId:d.companyId,status:{in:['RESTRICTED','FROZEN']}},data:{status:'FROZEN',authVersion:{increment:1}}});if(changed.count){accountStatus='FROZEN';await tx.incident.updateMany({where:{userId:d.userId,severity:'CRITICAL',status:{in:['OPEN','NEW','INVESTIGATING']}},data:{status:'CONTAINED'}});await audit(tx,d.user,'ACCOUNT_OS_CONTAINMENT_CONFIRMED',{deviceId:d.id,commandId:command.commandId,resultCode:report.resultCode},d.userId);notifications.push(...await createContainmentNotifications(tx,{companyId:d.companyId,user:d.user,type:'CONTAINMENT_CONFIRMED',severity:'CRITICAL',title:'Endpoint containment confirmed',message:`${d.user.name}: all targeted Windows endpoints confirmed OS containment.`,dedupeKey:`containment:blocked:${command.commandId}`,metadata:{deviceId:d.id,commandId:command.commandId,resultCode:report.resultCode}}));}}
          }
          if(success&&command.action==='ALLOW'){
            const blocked=await enforcement.findMany({where:{userId:d.userId,action:'BLOCK',status:'SUCCEEDED'},select:{deviceId:true},distinct:['deviceId']});
            const states=await Promise.all(blocked.map(item=>enforcement.findFirst({where:{deviceId:item.deviceId,userId:d.userId,action:'ALLOW'},orderBy:{createdAt:'desc'}})));
            if(blocked.length&&states.every(item=>item?.status==='SUCCEEDED')){const restored=await tx.user.updateMany({where:{id:d.userId,companyId:d.companyId,status:{in:['FROZEN','RESTRICTED']}},data:{status:'ACTIVE',authVersion:{increment:1}}});if(restored.count){accountStatus='ACTIVE';await tx.session.updateMany({where:{userId:d.userId,revokedAt:null},data:{revokedAt:new Date()}});await audit(tx,d.user,'ACCOUNT_RESTORATION_CONFIRMED',{deviceId:d.id,commandId:command.commandId,resultCode:report.resultCode},d.userId);notifications.push(...await createContainmentNotifications(tx,{companyId:d.companyId,user:d.user,type:'RESTORATION_CONFIRMED',severity:'HIGH',title:'Endpoint restoration confirmed',message:`${d.user.name}: all targeted Windows endpoints confirmed OS restoration.`,dedupeKey:`containment:allowed:${command.commandId}`,metadata:{deviceId:d.id,commandId:command.commandId,resultCode:report.resultCode}}));}}
          }
          if(!success&&!pending){
            notifications.push(...await createContainmentNotifications(tx,{companyId:d.companyId,user:d.user,type:unsupported?'CONTAINMENT_UNSUPPORTED':'CONTAINMENT_FAILED',severity:'CRITICAL',title:unsupported?'Endpoint containment unsupported':'Endpoint containment failed',message:`${d.user.name}: endpoint ${d.name} reported ${report.resultCode} while processing ${command.action}. OS containment remains unconfirmed.`,dedupeKey:`containment:result:${command.commandId}:${report.resultCode}`,metadata:{deviceId:d.id,commandId:command.commandId,action:command.action,resultCode:report.resultCode,status:unsupported?'UNSUPPORTED':'FAILED'}}));
          }
        }
      }
      let agentCommandAck=null;
      if(stopReport&&enforcement){
        const stop=await enforcement.findUnique({where:{commandId:stopReport.commandId}});
        const expectedResult=stop?.action==='STOP_AGENT'?'STOP_ACCEPTED':stop?.action==='START_AGENT'?'START_ACCEPTED':null;
        const expectedState=stop?.action==='STOP_AGENT'?'PAUSED_BY_ADMIN':stop?.action==='START_AGENT'?'ACTIVE':null;
        // The endpoint clock may be slightly behind the server clock. Its
        // reportedAt is diagnostic only: command freshness is enforced using
        // this server-observed heartbeat and the persisted expiry, while the
        // authenticated device, pending command ID and reported state bind the
        // acknowledgement to the actual enrolled agent.
        // Legacy ADMIN_STOPPED proves the persisted admin flag. Legacy RUNNING
        // only proves that the flag is clear; it does not prove collectors are
        // active, so START acknowledgement requires explicit ACTIVE.
        const reportedState=body.health.monitoringState||(body.health.administrativeState==='ADMIN_STOPPED'?'PAUSED_BY_ADMIN':null);
        if(stop&&expectedResult===stopReport.resultCode&&reportedState===expectedState&&stop.deviceId===d.id&&stop.userId===d.userId&&stop.companyId===d.companyId&&['PENDING','PENDING_OFFLINE'].includes(stop.status)&&stop.expiresAt&&stop.expiresAt>observedAt){
          await enforcement.update({where:{id:stop.id},data:{status:'ACKNOWLEDGED',resultCode:stopReport.resultCode,acknowledgedAt:observedAt}});
          agentCommandAck=stop.commandId;
        }
      }
      let localOperationAck=null;
      if(localReport&&enforcement){
        const operation=await enforcement.findUnique({where:{commandId:localReport.requestId}});
        const actionReportMatches=operation?.action==='SERVICE_STOP'?localReport.resultCode==='GRANT_ACCEPTED':operation?.action==='AGENT_UNINSTALL';
        if(operation&&actionReportMatches&&LOCAL_OPERATION_ACTIONS.includes(operation.action)&&operation.deviceId===d.id&&operation.userId===d.userId&&operation.companyId===d.companyId&&operation.resultCode===`GRANT:${localReport.nonce}`&&operation.expiresAt>observedAt&&['AUTH_GRANT_ISSUED','AUTH_EXECUTING'].includes(operation.status)){
          const failed=localReport.resultCode==='UNINSTALL_SCHEDULE_FAILED';
          if(operation.status==='AUTH_GRANT_ISSUED'||failed)await enforcement.update({where:{id:operation.id},data:{status:failed?'AUTH_FAILED':'AUTH_EXECUTING',resultCode:failed?'UNINSTALL_SCHEDULE_FAILED':operation.resultCode,acknowledgedAt:observedAt}});
          localOperationAck=operation.commandId;
          if(failed)await audit(tx,d.user,'LOCAL_AGENT_OPERATION_FAILED',{requestId:operation.commandId,deviceId:d.id,action:operation.action,result:'UNINSTALL_SCHEDULE_FAILED'},d.userId);
        }
      }
      const usbReport=body.usbPolicyReport;
      if(usbReport!==undefined&&(!usbReport||typeof usbReport!=='object'||Array.isArray(usbReport)||Object.keys(usbReport).sort().join('|')!=='commandId|policy|reportedAt|resultCode'||typeof usbReport.commandId!=='string'||!['POLICY_APPLIED_UNVERIFIED','POLICY_FAILED','POLICY_UNSUPPORTED','POLICY_UNVERIFIED'].includes(usbReport.resultCode)||!Number.isFinite(Date.parse(usbReport.reportedAt))||Date.parse(usbReport.reportedAt)>Date.now()+60000))throw new EndpointError(400,'Invalid USB policy acknowledgement');
      let usbPolicyCommandAck=null;
      if(usbReport&&enforcement){
        let reportedPolicy;try{reportedPolicy=validateUsbPolicy(usbReport.policy);}catch{throw new EndpointError(400,'Invalid USB policy in acknowledgement');}
        const usbCommand=await enforcement.findUnique({where:{commandId:usbReport.commandId}});
        const expected=validateUsbPolicy(d.config.usbPolicy||DEFAULT_CONFIG.usbPolicy);
        if(usbCommand&&usbCommand.action==='SET_USB_POLICY'&&usbCommand.deviceId===d.id&&usbCommand.userId===d.userId&&usbCommand.companyId===d.companyId&&['PENDING','PENDING_OFFLINE'].includes(usbCommand.status)&&usbCommand.expiresAt&&usbCommand.expiresAt>observedAt&&JSON.stringify(expected)===JSON.stringify(reportedPolicy)){
          const status=['POLICY_APPLIED_UNVERIFIED','POLICY_UNVERIFIED'].includes(usbReport.resultCode)?'UNVERIFIED':usbReport.resultCode==='POLICY_UNSUPPORTED'?'UNSUPPORTED':'FAILED';
          await enforcement.update({where:{id:usbCommand.id},data:{status,resultCode:usbReport.resultCode,acknowledgedAt:observedAt}});
          usbPolicyCommandAck=usbCommand.commandId;
        }
      }
      const eligible=['win32','linux','darwin'].includes(d.platform) && d.mappedIdentity && ['EMPLOYEE','MANAGER'].includes(d.user.roleCode);
      const pendingAccountCommand=eligible&&enforcement?await enforcement.findFirst({where:{deviceId:d.id,action:{in:['BLOCK','ALLOW']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:observedAt}},orderBy:{createdAt:'asc'}}):null;
      const desired=eligible?(pendingAccountCommand?.action||(accountStatus==='FROZEN'?'BLOCK':accountStatus==='ACTIVE'?'ALLOW':'HOLD')):'HOLD';
      if(enforcement)await enforcement.updateMany({where:{deviceId:d.id,status:{in:['PENDING','PENDING_OFFLINE']},action:desired==='HOLD'?{notIn:['STOP_AGENT','START_AGENT','SET_USB_POLICY']}:{notIn:[desired,'STOP_AGENT','START_AGENT','SET_USB_POLICY']}},data:{status:'SUPERSEDED'}});
      let command=eligible&&enforcement?await enforcement.findFirst({where:{deviceId:d.id,status:{in:['PENDING','PENDING_OFFLINE']},action:desired},orderBy:{createdAt:'asc'}}):null;
      if(command){
        await tx.endpointEnforcementCommand.update({where:{id:command.id},data:{status:'PENDING',issuedAt:observedAt}});
        command={...command,issuedAt:observedAt};
      }
      let latestCommand=null;
      if(eligible&&desired!=='HOLD'&&!command&&enforcement){
        latestCommand=await enforcement.findFirst({where:{deviceId:d.id},orderBy:{createdAt:'desc'}});
        if(!latestCommand||latestCommand.action!==desired){
          command=await enforcement.create({data:{companyId:d.companyId,userId:d.userId,deviceId:d.id,action:desired,status:'PENDING',reason:'Reconcile the managed OS account with the server-validated account state.'}});
        }
      }
      const action=command?command.action:enforcement&&latestCommand?.action===desired?'HOLD':desired;
      let agentCommand=null;
      if(enforcement){
        await enforcement.updateMany({where:{deviceId:d.id,action:{in:['STOP_AGENT','START_AGENT']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{lte:observedAt}},data:{status:'EXPIRED',resultCode:'COMMAND_EXPIRED'}});
        const pendingStop=await enforcement.findFirst({where:{deviceId:d.id,action:{in:['STOP_AGENT','START_AGENT']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:observedAt}},orderBy:{createdAt:'asc'}});
        if(pendingStop){if(pendingStop.status==='PENDING_OFFLINE')await enforcement.update({where:{id:pendingStop.id},data:{status:'PENDING'}});agentCommand={commandId:pendingStop.commandId,deviceId:d.id,identity:d.mappedIdentity,action:pendingStop.action,issuedAt:pendingStop.issuedAt.toISOString(),expiresAt:pendingStop.expiresAt.toISOString()};}
      }
      let localOperationGrant=null;
      if(enforcement&&['win32','darwin'].includes(d.platform)&&d.mappedIdentity){
        await enforcement.updateMany({where:{deviceId:d.id,action:{in:LOCAL_OPERATION_ACTIONS},status:{in:['AUTH_REQUESTED','AUTH_APPROVED','AUTH_GRANT_ISSUED']},expiresAt:{lte:observedAt}},data:{status:'AUTH_EXPIRED',resultCode:'AUTHORIZATION_EXPIRED'}});
        localOperationGrant=await this.issueLocalOperationGrantForHeartbeat(tx,d,observedAt,d.platform==='darwin'?['AGENT_UNINSTALL']:LOCAL_OPERATION_ACTIONS);
      }
      let usbPolicyCommand=null;
      if(enforcement&&d.platform==='win32'&&d.mappedIdentity){
        await enforcement.updateMany({where:{deviceId:d.id,action:'SET_USB_POLICY',status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{lte:observedAt}},data:{status:'EXPIRED',resultCode:'COMMAND_EXPIRED'}});
        const pending=await enforcement.findFirst({where:{deviceId:d.id,action:'SET_USB_POLICY',status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:observedAt}},orderBy:{createdAt:'asc'}});
        if(pending){if(pending.status==='PENDING_OFFLINE')await enforcement.update({where:{id:pending.id},data:{status:'PENDING',issuedAt:observedAt}});usbPolicyCommand={action:'SET_USB_POLICY',commandId:pending.commandId,deviceId:d.id,identity:d.mappedIdentity,issuedAt:(pending.status==='PENDING_OFFLINE'?observedAt:pending.issuedAt).toISOString(),expiresAt:pending.expiresAt.toISOString(),policy:validateUsbPolicy(d.config.usbPolicy||DEFAULT_CONFIG.usbPolicy)};usbPolicyCommand.signature=signUsbPolicyCommand(Buffer.from(d.credentialHash,'hex'),usbPolicyCommand);}
      }
      let accountControl={deviceId:d.id,identity:d.mappedIdentity,action,issuedAt:observedAt.toISOString()};
      if(command){accountControl={action:command.action,commandId:command.commandId,deviceId:d.id,identity:d.mappedIdentity,issuedAt:observedAt.toISOString(),expiresAt:(command.expiresAt||new Date(observedAt.getTime()+120000)).toISOString()};accountControl.signature=signAccountControlCommand(Buffer.from(d.credentialHash,'hex'),accountControl);}
      return { config: {...DEFAULT_CONFIG,...d.config,usbPolicy:validateUsbPolicy(d.config.usbPolicy||DEFAULT_CONFIG.usbPolicy)}, accountControl,accountControlAck,agentCommand,agentCommandAck,localOperationGrant,localOperationAck,usbPolicyCommand,usbPolicyCommandAck,notifications, companyId: d.companyId, userId: d.userId, deviceId: d.id,cityDevice:d,generation,observedAt };
    }));
    const {cityDevice:d,generation,observedAt,notifications,...response}=result;
    broadcastSecurityNotifications(notifications);
    // Optional lookup cannot roll back or fail an authenticated heartbeat.
    // Ingest may update lastSeen independently; a separate generation prevents
    // delayed lookups overwriting a newer heartbeat, pause, disable or revoke.
    if(d.ipCityEnabled) {
      let estimate={status:'paused'};
      if(!d.config.paused&&!body.health.paused&&d.user.status==='ACTIVE') {
        try{estimate={...await this.locator.lookup(address),observedAt:observedAt.toISOString()};}
        catch{estimate={status:'lookup-unavailable'};}
        if(estimate.status==='public-ip-unavailable')reportCityAddress(addressDiagnostics);
      }
      try{await this.prisma.endpointDevice.updateMany({where:{id:d.id,revokedAt:null,credentialHash:hashSecret(secret),ipCityEnabled:true,ipCityGeneration:generation,config:{equals:d.config}},data:{ipCity:estimate}});}
      catch(error){if(isMissingCityColumn(error))invalidateCitySchema(this.prisma);console.warn('Endpoint city estimate could not be stored; authenticated heartbeat remains accepted.');}
    }
    return response;
  }
  async changeCity(admin,id,body) {
    if(!admin||!isEndpointAdmin(admin)||admin.status!=='ACTIVE'||!admin.companyId)throw new EndpointError(403,'Active administrator required');
    if(!body||typeof body.enabled!=='boolean'||Object.keys(body).some(key=>key!=='enabled'))throw new EndpointError(400,'Use enabled: true or false');
    if(!await citySchemaReady(this.prisma))throw new EndpointError(503,'City estimates are unavailable until the backend database update is applied. Existing devices and monitoring remain available.','CITY_MIGRATION_REQUIRED');
    await this.prisma.$transaction(async tx=>{
      const device=await tx.endpointDevice.findFirst({where:{id,companyId:admin.companyId,user:userScope(admin),revokedAt:null},select:coreDeviceSelect});
      if(!device)throw new EndpointError(404,'Device not found');
      if(body.enabled&&!device.enrolledAt)throw new EndpointError(409,'Enroll the assigned laptop first');
      const changed=await tx.endpointDevice.updateMany({where:{id,companyId:admin.companyId,user:userScope(admin),revokedAt:null},data:{ipCityEnabled:body.enabled,ipCityGeneration:{increment:1},ipCity:{status:body.enabled?'awaiting-heartbeat':'disabled'}}});
      if(changed.count!==1)throw new EndpointError(409,'Device changed; refresh and try again');
      await audit(tx,admin,body.enabled?'AGENT_CITY_ESTIMATE_ENABLED':'AGENT_CITY_ESTIMATE_DISABLED',{deviceId:id,source:'heartbeat-public-ip'});
    });
    return {success:true};
  }
  async dashboard(user, employeeId, eventType, deviceId, readinessDate) {
    if (employeeId !== undefined && (typeof employeeId !== 'string' || !employeeId.trim() || employeeId.length > 128)) throw new EndpointError(400, 'Invalid employee filter');
    if (eventType !== undefined && !['APPLICATION_ACTIVITY','APPLICATION_USAGE','PROCESS_ACTIVITY'].includes(eventType)) throw new EndpointError(400, 'Invalid activity filter');
    if (deviceId !== undefined && (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 128)) throw new EndpointError(400, 'Invalid device filter');
    let readinessWindow;
    try { readinessWindow = parseReadinessDate(readinessDate); }
    catch (error) { throw new EndpointError(400, error.message, 'INVALID_READINESS_DATE', { field: 'readinessDate', reason: 'invalid_utc_date' }); }
    if (employeeId && !isEndpointAdmin(user) && employeeId !== user.id) {
      const report = user.roleCode === 'MANAGER' && await this.prisma.user.findFirst({ where: { id: employeeId, managerId: user.id, assignedAdminId: user.assignedAdminId || null, companyId: user.companyId }, select: { id: true } });
      if (!report) throw new EndpointError(403, 'Employee access denied');
    }
    const userId = isEndpointAdmin(user) ? employeeId : (employeeId || user.id);
    const where = { companyId: user.companyId, user: userScope(user), ...(userId ? { userId } : {}) };
    const {devices,cityAvailable} = await withCitySchema(this.prisma,async cityAvailable=>({cityAvailable,devices:await this.prisma.endpointDevice.findMany({ where, select: {
      id: true, userId: true, name: true, platform: true, mappedIdentity: true, enrolledAt: true,
      revokedAt: true, lastSeen: true, agentVersion: true, health: true, config: true,...(cityAvailable?{ipCityEnabled:true,ipCity:true}:{}),
      enforcementCommands:{where:{action:{in:['BLOCK','ALLOW','STOP_AGENT','START_AGENT','SET_USB_POLICY','SERVICE_STOP','AGENT_UNINSTALL']}},orderBy:{createdAt:'desc'},take:10,select:{id:true,commandId:true,action:true,status:true,resultCode:true,reason:true,issuedAt:true,expiresAt:true,acknowledgedAt:true,createdAt:true,createdById:true}},
      user: { select: { id: true, name: true, employeeId: true, status:true, riskScore: true, trustScore: true, riskLevel: true, trustUpdatedAt: true, _count: { select: { riskScores: true } } } }
    }, orderBy: { createdAt: 'desc' } })}));
    const applicationActivity=devices.length?await this.prisma.endpointEvent.groupBy({
      by:['deviceId','userId'],
      where:{companyId:user.companyId,deviceId:{in:devices.map(device=>device.id)},userId:{in:[...new Set(devices.map(device=>device.userId))]},type:{in:['APPLICATION_FOREGROUND','APPLICATION_USAGE']}},
      _max:{occurredAt:true}
    }):[];
    const lastApplicationByDevice=new Map();
    for(const row of applicationActivity){const device=devices.find(item=>item.id===row.deviceId);if(device?.userId===row.userId&&row._max.occurredAt)lastApplicationByDevice.set(row.deviceId,row._max.occurredAt.toISOString());}
    // Preserve the newest Windows lifecycle command in the API even when a busy
    // device has more than five newer OS-account enforcement records.
    const lifecycleCommands=devices.length?await this.prisma.endpointEnforcementCommand.findMany({where:{companyId:user.companyId,deviceId:{in:devices.map(d=>d.id)},action:{in:['STOP_AGENT','START_AGENT','SET_USB_POLICY','SERVICE_STOP','AGENT_UNINSTALL']}},orderBy:{createdAt:'desc'},select:{id:true,commandId:true,deviceId:true,action:true,status:true,resultCode:true,reason:true,issuedAt:true,expiresAt:true,acknowledgedAt:true,createdAt:true,createdById:true}}):[];
    const latestLifecycleByDeviceAction=new Map();
    for(const command of lifecycleCommands){const key=`${command.deviceId}:${command.action}`;if(!latestLifecycleByDeviceAction.has(key))latestLifecycleByDeviceAction.set(key,command);}
    const commandsByDevice=new Map(devices.map(d=>[d.id,d.enforcementCommands||[]]));
    for(const d of devices){const list=commandsByDevice.get(d.id);for(const action of ['STOP_AGENT','START_AGENT','SET_USB_POLICY','SERVICE_STOP','AGENT_UNINSTALL']){const latest=latestLifecycleByDeviceAction.get(`${d.id}:${action}`);if(latest&&!list.some(command=>command.id===latest.id))list.push(latest);}list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
    // A device filter must resolve inside the already-scoped company/employee
    // list. This keeps the dashboard filter from becoming an IDOR.
    if (deviceId && !devices.some(d => d.id === deviceId)) throw new EndpointError(404, 'Device not found');
    const readinessDevices = devices.filter(d => !deviceId || d.id === deviceId);
    const readinessGroups = readinessDevices.length ? await this.prisma.endpointEvent.groupBy({
      by: ['deviceId', 'type', 'userId'],
      where: { companyId: user.companyId, deviceId: { in: readinessDevices.map(d => d.id) }, occurredAt: { gte: readinessWindow.start, lt: readinessWindow.end } },
      _count: { _all: true },
    }) : [];
    const supportedDiagnosticTypes = new Set(['PROCESS_START','PROCESS_STOP','PROCESS_RUNNING','APPLICATION_FOREGROUND','APPLICATION_USAGE','SESSION_LOGIN','SESSION_LOGOUT','SESSION_LOCK','SESSION_UNLOCK','SESSION_STATE','USB_CONNECTED','USB_REMOVED','FILE_CHANGE','NETWORK_CONNECTION']);
    const readinessScopes = readinessDevices.map(device => {
      const groups = readinessGroups.filter(group => group.deviceId === device.id);
      const eventCounts = Object.fromEntries([...supportedDiagnosticTypes].map(type => [type, 0]));
      let attributedEventCount = 0, unattributedEventCount = 0, unsupportedEventCount = 0;
      for (const group of groups) {
        const count = group._count._all;
        if (group.userId === device.userId) attributedEventCount += count;
        else unattributedEventCount += count;
        if (supportedDiagnosticTypes.has(group.type)) eventCounts[group.type] += count;
        else unsupportedEventCount += count;
      }
      const totalEventCount = attributedEventCount + unattributedEventCount;
      return {
        employeeId: device.userId,
        deviceId: device.id,
        window: { date: readinessWindow.date, timezone: 'UTC', startInclusive: readinessWindow.start.toISOString(), endExclusive: readinessWindow.end.toISOString(), state: readinessWindow.state },
        status: totalEventCount ? 'OBSERVATIONS_PRESENT_BUT_INCOMPATIBLE' : 'NO_ENDPOINT_EVENTS',
        totalEventCount, attributedEventCount, unattributedEventCount, unsupportedEventCount, eventCounts,
        derivableCalendarValues: { day_of_week: readinessWindow.dayOfWeek, is_weekend: readinessWindow.isWeekend },
        compatibleModelFeatureCount: 0,
        missingModelFeatures: featureSchema.feature_names.filter(name => !['day_of_week','is_weekend'].includes(name)),
        inferenceAllowed: false,
        reason: 'Endpoint observation types are not verified equivalents of the model training logs; event counts are readiness diagnostics only.',
      };
    });
    // Admin sees unattributed device activity, employees see only verified personal observations.
    // Filter in PostgreSQL BEFORE the limit. Filtering a mixed result in React
    // loses foreground usage whenever a process snapshot fills the 150 rows.
    const eventScope = { companyId: user.companyId, AND: [{device:{user:userScope(user)}}],
      ...(userId ? (isEndpointAdmin(user) ? { device: { userId } } : { userId }) : {}),
      ...(deviceId ? { deviceId } : {}) };
    const readEvents=type=>this.prisma.endpointEvent.findMany({where:{...eventScope,...(type?{type}:{})},orderBy:[{occurredAt:'desc'},{id:'desc'}],take:151});
    let events,hasMore,limit=150;
    if(eventType==='APPLICATION_ACTIVITY') {
      // Independent limits stop process churn hiding actual foreground usage.
      const batches=await Promise.all([
        readEvents({in:['APPLICATION_FOREGROUND','APPLICATION_USAGE']}),
        readEvents({in:['PROCESS_START','PROCESS_STOP','PROCESS_RUNNING']})
      ]);
      events=batches.flatMap(rows=>rows.slice(0,150)).sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt)||String(b.id).localeCompare(String(a.id)));
      hasMore=batches.some(rows=>rows.length>150);limit=300;
    } else {
      const rows=await readEvents(eventType==='PROCESS_ACTIVITY'?{in:['PROCESS_RUNNING','PROCESS_START','PROCESS_STOP']}:eventType);
      events=rows.slice(0,150);hasMore=rows.length>150;
    }
    const incidents = isEndpointAdmin(user)||user.roleCode==='MANAGER' ? await this.prisma.incident.findMany({ where: { user: userScope(user), ...(userId ? { userId } : {}) }, take: 30, orderBy: { createdAt: 'desc' } }) : [];
    const actorIds=[...new Set(devices.flatMap(d=>(commandsByDevice.get(d.id)||[]).map(c=>c.createdById).filter(Boolean)))];
    const actors=actorIds.length?await this.prisma.user.findMany({where:{id:{in:actorIds},companyId:user.companyId},select:{id:true,name:true}}):[];
    const actorNames=new Map(actors.map(actor=>[actor.id,actor.name]));
    const employees = isEndpointAdmin(user) ? await this.prisma.user.findMany({ where: { ...userScope(user), status: 'ACTIVE', roleCode: { in: ['EMPLOYEE','MANAGER'] } }, select: { id: true, employeeId: true, name: true }, orderBy: { name: 'asc' } }) : [];
    const now=Date.now();
    return { devices: devices.map(d => {
      const heartbeatAt=d.health?.lastHeartbeatAt;
      const heartbeatAge=Number.isFinite(Date.parse(heartbeatAt||''))?Math.max(0,now-Date.parse(heartbeatAt)):null;
      const heartbeatStatus=heartbeatAge===null?'UNKNOWN':heartbeatAge<=90000?'RECEIVING':heartbeatAge<=300000?'STALE':'NOT_RECEIVING';
      const connectionStatus=d.revokedAt?'REVOKED':!d.enrolledAt?'UNENROLLED':d.platform==='win32'?heartbeatStatus==='RECEIVING'?'CONNECTED':heartbeatStatus==='STALE'?'STALE':heartbeatStatus==='NOT_RECEIVING'?'OFFLINE':'UNKNOWN':!d.lastSeen||now-new Date(d.lastSeen).getTime()>300000?'OFFLINE':now-new Date(d.lastSeen).getTime()>90000?'STALE':'CONNECTED';
      return {...d,enforcementCommands:(commandsByDevice.get(d.id)||[]).map(command=>({...command,requestedBy:command.createdById?(actorNames.get(command.createdById)||'Administrator'):'Automatic policy'})),user:endpointMonitoringUser(d.user),ipCityProvider:this.locator.provider===undefined?'ipapi.co':this.locator.provider,ipCitySchemaReady:cityAvailable,ipCityEnabled:cityAvailable&&d.ipCityEnabled===true,ipCity:cityAvailable?cityView(d):{status:'migration-required'},lastHeartbeatAt:heartbeatAt||null,heartbeatAgeSeconds:heartbeatAge===null?null:Math.floor(heartbeatAge/1000),telemetryState:heartbeatStatus,lastApplicationActivityAt:lastApplicationByDevice.get(d.id)||null,connectionStatus};
    }), employees, events, timeline: { eventType: eventType || null, limit, hasMore }, incidents, ml: {...ML_AVAILABILITY, dataReadiness:createLiveModelDataReadiness({window:{date:readinessWindow.date,timezone:'UTC',startInclusive:readinessWindow.start.toISOString(),endExclusive:readinessWindow.end.toISOString(),state:readinessWindow.state},scopes:readinessScopes})} };
  }
  async change(admin, id, body, revoke = false) {
    if (!admin || !isEndpointAdmin(admin) || admin.status !== 'ACTIVE' || !admin.companyId) throw new EndpointError(403, 'Active administrator required');
    const reason=revoke?String(body?.reason||'').trim():null;
    if(revoke&&(reason.length<8||reason.length>500))throw new EndpointError(400,'Provide an audit reason of 8 to 500 characters','AGENT_ACTION_REASON_REQUIRED');
    const config=revoke?null:validateConfig(body.config);
    await withCitySchema(this.prisma,cityAvailable=>this.prisma.$transaction(async tx => {
      const data = revoke ? { revokedAt: new Date(), credentialHash: null, enrollmentHash: null,...(cityAvailable?{ipCityEnabled:false,ipCityGeneration:{increment:1},ipCity:{status:'revoked'}}:{}) } : { config,...(cityAvailable?{ipCityGeneration:{increment:1},...(config.paused?{ipCity:{status:'paused'}}:{})}:{}) };
      const result = await tx.endpointDevice.updateMany({ where: { id, companyId: admin.companyId, user: userScope(admin) }, data });
      if (!result.count) throw new EndpointError(404, 'Device not found');
      if(revoke&&tx.endpointEnforcementCommand){
        await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:{in:['STOP_AGENT','START_AGENT']},status:{in:['PENDING','PENDING_OFFLINE']}},data:{status:'SUPERSEDED',resultCode:'CREDENTIAL_REVOKED'}});
        await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:{in:LOCAL_OPERATION_ACTIONS},status:{in:['AUTH_REQUESTED','AUTH_APPROVED','AUTH_GRANT_ISSUED']}},data:{status:'SUPERSEDED',resultCode:'CREDENTIAL_REVOKED'}});
      }
      await audit(tx, admin, revoke ? 'AGENT_REVOKED' : data.config.paused ? 'AGENT_PAUSED' : 'AGENT_CONFIGURATION_UPDATED', {
        deviceId: id, actorId: admin.id, actorRole: admin.roleCode, isMainAdmin: admin.isMainAdmin === true,
        ...(revoke ? { reason } : { paused: data.config.paused })
      });
    }));
    return { success: true };
  }
  async requestAgentStop(admin,id,body) {
    if(!admin||!isEndpointAdmin(admin)||admin.status!=='ACTIVE'||!admin.companyId)throw new EndpointError(403,'Active administrator required');
    if(!admin.isMainAdmin){const platform=await this.prisma.endpointDevice.findFirst({where:{id,companyId:admin.companyId},select:{platform:true}});if(platform?.platform==='darwin')throw new EndpointError(403,'Main Admin access is required for macOS monitoring pause','MAIN_ADMIN_REQUIRED');}
    const reason=String(body?.reason||'').trim();
    if(reason.length<8||reason.length>500||Object.keys(body||{}).some(key=>key!=='reason'))throw new EndpointError(400,'Provide an audit reason of 8 to 500 characters','AGENT_ACTION_REASON_REQUIRED');
    const now=new Date(),expiresAt=new Date(now.getTime()+2*60*1000);
    return this.prisma.$transaction(async tx=>{
      const device=await tx.endpointDevice.findFirst({where:{id,companyId:admin.companyId,user:userScope(admin),revokedAt:null,enrolledAt:{not:null}},select:{id:true,companyId:true,userId:true,platform:true,mappedIdentity:true,lastSeen:true,health:true}});
      if(!device)throw new EndpointError(404,'Enrolled device not found in company');
      if(!['win32','darwin'].includes(device.platform))throw new EndpointError(409,'Remote monitoring pause is unsupported on this agent platform','AGENT_STOP_UNSUPPORTED');
      if(device.platform==='darwin'&&!admin.isMainAdmin)throw new EndpointError(403,'Main Admin access is required for macOS monitoring pause','MAIN_ADMIN_REQUIRED');
      if(!device.mappedIdentity)throw new EndpointError(409,'A verified employee-to-device identity mapping is required before remote pause','AGENT_IDENTITY_UNVERIFIED');
      await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:'START_AGENT',status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:now}},data:{status:'SUPERSEDED',resultCode:'OPPOSING_ADMIN_COMMAND'}});
      const prior=await tx.endpointEnforcementCommand.findFirst({where:{deviceId:id,action:'STOP_AGENT',status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:now}},orderBy:{createdAt:'asc'}});
      if(prior)return{success:true,created:false,userId:device.userId,command:{commandId:prior.commandId,action:prior.action,status:prior.status,reason:prior.reason,issuedAt:prior.issuedAt,expiresAt:prior.expiresAt,requestedBy:admin.name||admin.email}};
      await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:{in:['STOP_AGENT','START_AGENT']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:now}},data:{status:'SUPERSEDED',resultCode:'OPPOSING_ADMIN_COMMAND'}});
      await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:{in:['STOP_AGENT','START_AGENT']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{lte:now}},data:{status:'EXPIRED',resultCode:'COMMAND_EXPIRED'}});
      const online=hasFreshAgentContact(device,now);
      const command=await tx.endpointEnforcementCommand.create({data:{companyId:device.companyId,userId:device.userId,deviceId:id,action:'STOP_AGENT',status:online?'PENDING':'PENDING_OFFLINE',reason,issuedAt:now,expiresAt,createdById:admin.id}});
      await audit(tx,admin,'AGENT_STOP_REQUESTED',{deviceId:id,commandId:command.commandId,reason,expiresAt:expiresAt.toISOString()},device.userId);
      return{success:true,created:true,userId:device.userId,command:{commandId:command.commandId,action:command.action,status:command.status,reason:command.reason,issuedAt:command.issuedAt,expiresAt:command.expiresAt,requestedBy:admin.name||admin.email}};
    });
  }
  async requestAgentStart(admin,id,body) {
    if(!admin||!isEndpointAdmin(admin)||admin.status!=='ACTIVE'||!admin.companyId)throw new EndpointError(403,'Active administrator required');
    if(!admin.isMainAdmin){const platform=await this.prisma.endpointDevice.findFirst({where:{id,companyId:admin.companyId},select:{platform:true}});if(platform?.platform==='darwin')throw new EndpointError(403,'Main Admin access is required for macOS monitoring resume','MAIN_ADMIN_REQUIRED');}
    const reason=String(body?.reason||'').trim();
    if(reason.length<8||reason.length>500||Object.keys(body||{}).some(key=>key!=='reason'))throw new EndpointError(400,'Provide an audit reason of 8 to 500 characters','AGENT_ACTION_REASON_REQUIRED');
    const now=new Date(),expiresAt=new Date(now.getTime()+2*60*1000);
    return this.prisma.$transaction(async tx=>{
      const device=await tx.endpointDevice.findFirst({where:{id,companyId:admin.companyId,user:userScope(admin),revokedAt:null,enrolledAt:{not:null}},select:{id:true,companyId:true,userId:true,platform:true,mappedIdentity:true,lastSeen:true,health:true}});
      if(!device)throw new EndpointError(404,'Enrolled device not found in company');
      if(!['win32','darwin'].includes(device.platform))throw new EndpointError(409,'Remote monitoring resume is unsupported on this agent platform','AGENT_START_UNSUPPORTED');
      if(device.platform==='darwin'&&!admin.isMainAdmin)throw new EndpointError(403,'Main Admin access is required for macOS monitoring resume','MAIN_ADMIN_REQUIRED');
      if(!device.mappedIdentity)throw new EndpointError(409,'A verified employee-to-device identity mapping is required before remote resume','AGENT_IDENTITY_UNVERIFIED');
      await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:'STOP_AGENT',status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:now}},data:{status:'SUPERSEDED',resultCode:'OPPOSING_ADMIN_COMMAND'}});
      const prior=await tx.endpointEnforcementCommand.findFirst({where:{deviceId:id,action:'START_AGENT',status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:now}},orderBy:{createdAt:'asc'}});
      if(prior)return{success:true,created:false,userId:device.userId,command:{commandId:prior.commandId,action:prior.action,status:prior.status,reason:prior.reason,issuedAt:prior.issuedAt,expiresAt:prior.expiresAt,requestedBy:admin.name||admin.email}};
      await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:{in:['STOP_AGENT','START_AGENT']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:now}},data:{status:'SUPERSEDED',resultCode:'OPPOSING_ADMIN_COMMAND'}});
      await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:{in:['STOP_AGENT','START_AGENT']},status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{lte:now}},data:{status:'EXPIRED',resultCode:'COMMAND_EXPIRED'}});
      const online=hasFreshAgentContact(device,now);
      const command=await tx.endpointEnforcementCommand.create({data:{companyId:device.companyId,userId:device.userId,deviceId:id,action:'START_AGENT',status:online?'PENDING':'PENDING_OFFLINE',reason,issuedAt:now,expiresAt,createdById:admin.id}});
      await audit(tx,admin,'AGENT_START_REQUESTED',{deviceId:id,commandId:command.commandId,reason,expiresAt:expiresAt.toISOString()},device.userId);
      return{success:true,created:true,userId:device.userId,command:{commandId:command.commandId,action:command.action,status:command.status,reason:command.reason,issuedAt:command.issuedAt,expiresAt:command.expiresAt,requestedBy:admin.name||admin.email}};
    });
  }
  async requestLocalOperation(secret,body) {
    const action=body?.action,requestId=body?.requestId,requestedAt=Date.parse(body?.requestedAt),identity=body?.identity,deviceId=body?.deviceId,reason=String(body?.reason||'').trim();
    if(Object.keys(body||{}).some(key=>!['action','requestId','requestedAt','identity','deviceId','reason'].includes(key))||!LOCAL_OPERATION_ACTIONS.includes(action)||typeof requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(requestId)||!Number.isFinite(requestedAt)||Math.abs(Date.now()-requestedAt)>60000||typeof identity!=='string'||reason.length<8||reason.length>500)throw new EndpointError(400,'A valid action, request ID, timestamp, enrolled identity and 8–500 character reason are required.','LOCAL_OPERATION_REQUEST_INVALID');
    return this.prisma.$transaction(async tx=>{
      const device=await this.authenticate(tx,secret);
      const platformActionAllowed=device.platform==='win32'||(device.platform==='darwin'&&action==='AGENT_UNINSTALL');
      if(device.id!==deviceId||device.mappedIdentity!==identity||!platformActionAllowed||!device.enrolledAt)throw new EndpointError(403,'Request device, employee identity or platform does not support this local operation.','LOCAL_OPERATION_DEVICE_MISMATCH');
      if(device.user.status!=='ACTIVE'||!['EMPLOYEE','MANAGER'].includes(device.user.roleCode))throw new EndpointError(403,'Only the active employee assigned to this device may request a local operation.','LOCAL_OPERATION_REQUEST_FORBIDDEN');
      const existing=await tx.endpointEnforcementCommand.findUnique({where:{commandId:requestId}});
      if(existing){if(existing.deviceId!==device.id||existing.action!==action)throw new EndpointError(409,'Request ID was already used for another action or device.','LOCAL_OPERATION_REQUEST_REPLAY');return{requestId,status:existing.status,expiresAt:existing.expiresAt};}
      const active=await tx.endpointEnforcementCommand.findFirst({where:{deviceId:device.id,action:{in:LOCAL_OPERATION_ACTIONS},status:{in:['AUTH_REQUESTED','AUTH_APPROVED','AUTH_GRANT_ISSUED','AUTH_EXECUTING']},expiresAt:{gt:new Date()}},orderBy:{createdAt:'desc'}});
      if(active)return{requestId:active.commandId,status:active.status,expiresAt:active.expiresAt,existing:true};
      const expiresAt=new Date(Date.now()+15*60*1000);
      const request=await tx.endpointEnforcementCommand.create({data:{commandId:requestId,companyId:device.companyId,userId:device.userId,deviceId:device.id,action,status:'AUTH_REQUESTED',reason,issuedAt:new Date(),expiresAt}});
      await audit(tx,device.user,'LOCAL_AGENT_OPERATION_REQUESTED',{requestId,requestedAt:new Date(requestedAt).toISOString(),deviceId:device.id,employeeId:device.user.employeeId,action,reason,expiresAt:expiresAt.toISOString()},device.userId);
      return{requestId,status:request.status,expiresAt:request.expiresAt};
    });
  }
  async issueLocalOperationGrantForHeartbeat(tx,device,now,allowedActions=LOCAL_OPERATION_ACTIONS) {
    const request=await tx.endpointEnforcementCommand.findFirst({where:{deviceId:device.id,companyId:device.companyId,userId:device.userId,action:{in:allowedActions},status:{in:['AUTH_APPROVED','AUTH_GRANT_ISSUED']},expiresAt:{gt:now}},orderBy:{createdAt:'asc'}});
    if(!request)return null;
    let issued=request;
    if(request.status==='AUTH_APPROVED'){
      const nonce=randomUUID(),expiresAt=new Date(Math.min(now.getTime()+120000,request.expiresAt.getTime()));
      const changed=await tx.endpointEnforcementCommand.updateMany({where:{id:request.id,status:'AUTH_APPROVED',expiresAt:{gt:now}},data:{status:'AUTH_GRANT_ISSUED',issuedAt:now,expiresAt,resultCode:`GRANT:${nonce}`}});
      if(changed.count!==1)return null;
      issued={...request,status:'AUTH_GRANT_ISSUED',issuedAt:now,expiresAt,resultCode:`GRANT:${nonce}`};
    }
    const nonce=issued.resultCode?.startsWith('GRANT:')?issued.resultCode.slice(6):'';
    if(!/^[0-9a-f-]{36}$/i.test(nonce))return null;
    const grant={version:1,requestId:issued.commandId,deviceId:device.id,identity:device.mappedIdentity,action:issued.action,issuedAt:issued.issuedAt.toISOString(),expiresAt:issued.expiresAt.toISOString(),nonce};
    grant.signature=signLocalOperationGrant(Buffer.from(device.credentialHash,'hex'),grant);
    return grant;
  }
  async completeLocalOperation(secret,requestId,body) {
    const nonce=body?.nonce,result=body?.result;
    if(Object.keys(body||{}).some(key=>!['nonce','result'].includes(key))||typeof nonce!=='string'||!/^[0-9a-f-]{36}$/i.test(nonce)||!['SUCCEEDED','FAILED'].includes(result))throw new EndpointError(400,'Invalid operation completion report.','LOCAL_OPERATION_REPORT_INVALID');
    return this.prisma.$transaction(async tx=>{
      const device=await this.authenticate(tx,secret),request=await tx.endpointEnforcementCommand.findUnique({where:{commandId:requestId}}),now=new Date();
      if(!request||request.action!=='AGENT_UNINSTALL'||request.deviceId!==device.id||request.companyId!==device.companyId||request.userId!==device.userId||request.status!=='AUTH_EXECUTING'||request.expiresAt<=now||request.resultCode!==`GRANT:${nonce}`)throw new EndpointError(409,'Authorization grant is invalid, expired, or already consumed.','LOCAL_OPERATION_GRANT_REPLAY');
      const success=result==='SUCCEEDED';
      await tx.endpointEnforcementCommand.update({where:{id:request.id},data:{status:success?'AUTH_COMPLETED':'AUTH_FAILED',resultCode:result,acknowledgedAt:now}});
      if(success&&request.action==='AGENT_UNINSTALL'){
        const revoked=await tx.endpointDevice.updateMany({where:{id:device.id,companyId:device.companyId,userId:device.userId,credentialHash:device.credentialHash,revokedAt:null},data:{revokedAt:now,credentialHash:null,enrollmentHash:null}});
        if(revoked.count!==1)throw new EndpointError(409,'Device credential changed before authorized uninstallation.','LOCAL_OPERATION_DEVICE_CHANGED');
      }
      await audit(tx,device.user,success?'LOCAL_AGENT_OPERATION_COMPLETED':'LOCAL_AGENT_OPERATION_FAILED',{requestId,deviceId:device.id,action:request.action,result,reason:request.reason},device.userId);
      return{requestId,status:success?'AUTH_COMPLETED':'AUTH_FAILED',credentialRevoked:success&&request.action==='AGENT_UNINSTALL'};
    });
  }
  async listLocalOperationRequests(admin) {
    if(!admin?.isMainAdmin||admin.status!=='ACTIVE')throw new EndpointError(403,'Main Admin access required.','MAIN_ADMIN_REQUIRED');
    const now=new Date();
    await this.prisma.endpointEnforcementCommand.updateMany({where:{companyId:admin.companyId,action:{in:LOCAL_OPERATION_ACTIONS},status:{in:['AUTH_REQUESTED','AUTH_APPROVED']},expiresAt:{lte:now}},data:{status:'AUTH_EXPIRED',resultCode:'AUTHORIZATION_EXPIRED'}});
    const requests=await this.prisma.endpointEnforcementCommand.findMany({where:{companyId:admin.companyId,action:{in:LOCAL_OPERATION_ACTIONS}},include:{device:{select:{id:true,name:true,platform:true,user:{select:{id:true,name:true,employeeId:true,companyId:true}}}}},orderBy:{createdAt:'desc'},take:100});
    const reviewerIds=[...new Set(requests.map(request=>request.createdById).filter(Boolean))],reviewers=reviewerIds.length?await this.prisma.user.findMany({where:{id:{in:reviewerIds},companyId:admin.companyId},select:{id:true,name:true,email:true}}):[],reviewerById=new Map(reviewers.map(reviewer=>[reviewer.id,reviewer]));
    const requestIds=new Set(requests.map(request=>request.commandId)),requesterIds=[...new Set(requests.map(request=>request.userId))],reviewLogs=requests.length?await this.prisma.auditLog.findMany({where:{companyId:admin.companyId,userId:{in:requesterIds},action:{in:['LOCAL_AGENT_OPERATION_APPROVED','LOCAL_AGENT_OPERATION_REJECTED']}},select:{timestamp:true,action:true,metadata:true},orderBy:{timestamp:'desc'},take:500}):[],reviewByRequest=new Map(reviewLogs.filter(row=>requestIds.has(row.metadata?.requestId)).map(row=>[row.metadata.requestId,row]));
    return{requests:requests.map(request=>{const review=reviewByRequest.get(request.commandId);return{...request,requestedAt:request.createdAt,reviewedAt:review?.timestamp||null,reviewedBy:request.createdById?reviewerById.get(request.createdById)?.name||'Administrator':null};})};
  }
  async reviewLocalOperationRequest(admin,requestId,decision,reason) {
    if(!admin?.isMainAdmin||admin.status!=='ACTIVE')throw new EndpointError(403,'Main Admin access required.','MAIN_ADMIN_REQUIRED');
    if(!['APPROVE','REJECT'].includes(decision)||typeof reason!=='string'||reason.trim().length<8||reason.trim().length>500)throw new EndpointError(400,'Choose approve or reject and provide an 8–500 character review reason.','LOCAL_OPERATION_REVIEW_INVALID');
    return this.prisma.$transaction(async tx=>{
      const request=await tx.endpointEnforcementCommand.findFirst({where:{commandId:requestId,companyId:admin.companyId,action:{in:LOCAL_OPERATION_ACTIONS},status:'AUTH_REQUESTED',expiresAt:{gt:new Date()},device:{user:{companyId:admin.companyId}}},include:{device:{select:{name:true}}}});
      if(!request)throw new EndpointError(404,'Pending authorization request not found or expired.','LOCAL_OPERATION_REQUEST_NOT_FOUND');
      const status=decision==='APPROVE'?'AUTH_APPROVED':'AUTH_REJECTED';
      const changed=await tx.endpointEnforcementCommand.updateMany({where:{id:request.id,status:'AUTH_REQUESTED',expiresAt:{gt:new Date()}},data:{status,createdById:admin.id,reason:`${request.reason}\nMain Admin review: ${reason.trim()}`}});
      if(changed.count!==1)throw new EndpointError(409,'Request was already reviewed.','LOCAL_OPERATION_ALREADY_REVIEWED');
      await audit(tx,admin,decision==='APPROVE'?'LOCAL_AGENT_OPERATION_APPROVED':'LOCAL_AGENT_OPERATION_REJECTED',{requestId,deviceId:request.deviceId,employeeId:request.userId,action:request.action,reason:reason.trim()},request.userId);
      return{requestId,status,action:request.action,deviceId:request.deviceId,deviceName:request.device.name,reviewedAt:new Date(),reviewedBy:admin.name||admin.email};
    });
  }
  async setUsbPolicy(admin,id,body) {
    if(!admin||!isEndpointAdmin(admin)||admin.status!=='ACTIVE'||!admin.companyId)throw new EndpointError(403,'Active administrator required');
    let policy;try{policy=validateUsbPolicy(body?.policy);}catch{throw new EndpointError(400,'Choose ALLOW or BLOCK for USB storage, portable devices and CD/DVD','USB_POLICY_INVALID');}
    const reason=String(body?.reason||'').trim();
    if(Object.keys(body||{}).some(key=>!['policy','reason'].includes(key))||reason.length<8||reason.length>500)throw new EndpointError(400,'Provide an audit reason of 8 to 500 characters','AGENT_ACTION_REASON_REQUIRED');
    const now=new Date(),expiresAt=new Date(now.getTime()+24*60*60*1000);
    return this.prisma.$transaction(async tx=>{
      const device=await tx.endpointDevice.findFirst({where:{id,companyId:admin.companyId,user:userScope(admin),revokedAt:null,enrolledAt:{not:null}},select:{id:true,companyId:true,userId:true,platform:true,mappedIdentity:true,lastSeen:true,config:true}});
      if(!device)throw new EndpointError(404,'Enrolled device not found in company');
      if(device.platform!=='win32'||!device.mappedIdentity)throw new EndpointError(409,'USB policy enforcement requires a mapped Windows service agent','USB_POLICY_UNSUPPORTED');
      const priorPolicy=validateUsbPolicy(device.config?.usbPolicy||DEFAULT_CONFIG.usbPolicy);
      const pending=await tx.endpointEnforcementCommand.findFirst({where:{deviceId:id,action:'SET_USB_POLICY',status:{in:['PENDING','PENDING_OFFLINE']},expiresAt:{gt:now}},orderBy:{createdAt:'desc'}});
      if(JSON.stringify(priorPolicy)===JSON.stringify(policy)&&pending)return{success:true,created:false,userId:device.userId,command:{commandId:pending.commandId,action:pending.action,status:pending.status,reason:pending.reason,issuedAt:pending.issuedAt,expiresAt:pending.expiresAt,policy}};
      await tx.endpointEnforcementCommand.updateMany({where:{deviceId:id,action:'SET_USB_POLICY',status:{in:['PENDING','PENDING_OFFLINE']}},data:{status:'SUPERSEDED',resultCode:'NEWER_USB_POLICY'}});
      await tx.endpointDevice.update({where:{id},data:{config:{...DEFAULT_CONFIG,...device.config,usbPolicy:policy}}});
      const online=Boolean(device.lastSeen&&now.getTime()-device.lastSeen.getTime()<=5*60*1000);
      const command=await tx.endpointEnforcementCommand.create({data:{companyId:device.companyId,userId:device.userId,deviceId:id,action:'SET_USB_POLICY',status:online?'PENDING':'PENDING_OFFLINE',reason,issuedAt:now,expiresAt,createdById:admin.id}});
      await audit(tx,admin,'ENDPOINT_USB_POLICY_REQUESTED',{deviceId:id,commandId:command.commandId,policy,reason,expiresAt:expiresAt.toISOString()},device.userId);
      return{success:true,created:true,userId:device.userId,command:{commandId:command.commandId,action:command.action,status:command.status,reason:command.reason,issuedAt:command.issuedAt,expiresAt:command.expiresAt,policy}};
    });
  }
}
