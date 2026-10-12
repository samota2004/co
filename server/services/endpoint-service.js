import { randomBytes, createHash } from 'node:crypto';
import { audit, userScope } from './security-common.js';
import { DEFAULT_CONFIG, validateConfig, validateEvent, validateHealth, validateEnrollment } from '../../agent/shared/contract.js';
export const hashSecret = s => createHash('sha256').update(s).digest('hex');
export const isEndpointAdmin = u => ['SECURITY_ADMIN', 'SYSTEM_ADMIN'].includes(u.roleCode);
export const ML_AVAILABILITY = Object.freeze({ available: false,
  reason: 'The trained model requires complete 21-feature CERT user-day logon/device/file/HTTP/email coverage. File changes are not reads; connections are not HTTP history. Email/content features and training preprocessing are unavailable. No endpoint inference is performed.' });
export class EndpointError extends Error {
  constructor(status, message, code = 'ENDPOINT_REJECTED', diagnostics = {}) {
    super(message); this.name = 'EndpointError'; this.status = status; this.code = code;
    this.field = diagnostics.field; this.reason = diagnostics.reason;
  }
}
export class EndpointService {
  constructor(prisma) { this.prisma = prisma; }
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
        const existing = await tx.endpointDevice.findFirst({ where: { id: deviceId, companyId: admin.companyId, user: userScope(admin) } });
        if (!existing) throw new EndpointError(404, 'Device not found in company');
        if (existing.revokedAt || existing.enrolledAt) throw new EndpointError(409, 'An enrolled or revoked laptop cannot be reassigned. Revoke and create a new enrollment record.');
        if (existing.platform !== platform) throw new EndpointError(400, 'Selected device platform does not match');
        const result = await tx.endpointDevice.updateMany({ where: { id: deviceId, companyId: admin.companyId, user: userScope(admin), enrolledAt: null, revokedAt: null }, data: values });
        if (result.count !== 1) throw new EndpointError(409, 'Device changed during assignment. Refresh and try again.');
        return { ...existing, ...values };
      });
    } else {
      device = await this.prisma.endpointDevice.create({ data: { companyId: admin.companyId, ...values } });
    }
    return { deviceId: device.id, userId: employee.id, name: device.name,
      ...(token ? { enrollmentToken: token, expiresAt } : {}) };
  }
  async issueEnrollmentToken(admin, deviceId) {
    if (!isEndpointAdmin(admin)) throw new EndpointError(403, 'Administrator required');
    if (typeof deviceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(deviceId)) throw new EndpointError(400, 'Select an assigned device');
    const token = randomBytes(32).toString('base64url'), expiresAt = new Date(Date.now() + 15 * 60000);
    return this.prisma.$transaction(async tx => {
      const device = await tx.endpointDevice.findFirst({ where: { id: deviceId, companyId: admin.companyId, user: userScope(admin) }, include: { user: true } });
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
      const device = await tx.endpointDevice.findFirst({ where: { enrollmentHash: tokenHash }, include: { user: true } });
      // A consumed/replaced/revoked token hash is erased. Do not retain token
      // history or weaken single-use checks just to distinguish these cases.
      if (!device) throw new EndpointError(401, 'Enrollment token is invalid, replaced, already used or revoked. Ask an administrator for a fresh token for an unenrolled device.', 'ENROLLMENT_TOKEN_UNAVAILABLE');
      if (device.revokedAt) throw new EndpointError(401, 'Device enrollment has been revoked. An administrator must create a new assignment.', 'ENROLLMENT_DEVICE_REVOKED');
      if (device.enrolledAt) throw new EndpointError(401, 'Enrollment token has already been used. Do not enroll this device again.', 'ENROLLMENT_TOKEN_USED');
      if (!device.enrollmentExpiresAt || new Date(device.enrollmentExpiresAt).getTime() <= Date.now()) throw new EndpointError(401, 'Enrollment token expired. Issue a fresh token and use it within 15 minutes.', 'ENROLLMENT_TOKEN_EXPIRED');
      if (device.platform !== body.platform) throw new EndpointError(400, 'Enrollment token belongs to a different operating system. Select an assignment matching this agent operating system.', 'ENROLLMENT_PLATFORM_MISMATCH', { field: 'platform', reason: 'assignment_mismatch' });
      if (!device.user || device.user.companyId !== device.companyId || device.user.status !== 'ACTIVE' || !['EMPLOYEE','MANAGER'].includes(device.user.roleCode)) throw new EndpointError(401, 'Device assignment is no longer valid for an active employee. Ask an administrator to review the assignment.', 'ENROLLMENT_ASSIGNMENT_INVALID');
      const where = { enrollmentHash: tokenHash, enrollmentExpiresAt: { gt: new Date() }, enrolledAt: null, revokedAt: null, platform: body.platform,
        userId: device.userId, companyId: device.companyId, user: { companyId: device.companyId, status: 'ACTIVE', roleCode: { in: ['EMPLOYEE','MANAGER'] } } };
      const changed = await tx.endpointDevice.updateMany({ where: { ...where, id: device.id }, data: {
        enrollmentHash: null, enrollmentExpiresAt: null, credentialHash: hashSecret(secret), enrolledAt: new Date(), agentVersion: body.agentVersion
      } });
      if (changed.count !== 1) throw new EndpointError(401, 'Enrollment was consumed, expired, revoked or changed during exchange. Refresh the device status before retrying.', 'ENROLLMENT_EXCHANGE_CONFLICT');
      return { deviceId: device.id, credential: secret, config: device.config, mappedIdentity: device.mappedIdentity };
    });
  }
  async authenticate(tx, secret) {
    if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new EndpointError(401, 'Device authentication required');
    const d = await tx.endpointDevice.findFirst({ where: { credentialHash: hashSecret(secret), revokedAt: null }, include: { user: true } });
    if (!d || d.user.companyId !== d.companyId) throw new EndpointError(401, 'Invalid or revoked device credential');
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
      const records = body.events.map(e => ({ ...e, occurredAt: new Date(e.occurredAt), companyId: d.companyId,
        // Device-wide observations intentionally have no employee attribution.
        userId: /^(PROCESS_|APPLICATION_|SESSION_)/.test(e.type) && d.mappedIdentity && e.metadata.identity === d.mappedIdentity ? d.userId : null }));
      await tx.endpointEvent.createMany({ data: records, skipDuplicates: true });
      return { acceptedEventIds: body.events.map(e => e.eventId), companyId: d.companyId, userId: d.userId, deviceId: d.id };
    });
  }
  async heartbeat(secret, body) {
    try { validateHealth(body.health); } catch (e) { throw new EndpointError(400, e.message); }
    if (typeof body.agentVersion !== 'string' || body.agentVersion.length > 40) throw new EndpointError(400, 'Invalid version');
    return this.prisma.$transaction(async tx => {
      const d = await this.authenticate(tx, secret);
      const changed = await tx.endpointDevice.updateMany({ where: { id: d.id, credentialHash: hashSecret(secret), revokedAt: null }, data: { lastSeen: new Date(), agentVersion: body.agentVersion, health: body.health } });
      if (changed.count !== 1) throw new EndpointError(401, 'Revoked credential');
      // Only the authenticated enrollment's employee determines the OS target.
      // Keep device credentials valid while frozen so an administrator can restore access.
      const eligible=['win32','linux','darwin'].includes(d.platform) && d.mappedIdentity && ['EMPLOYEE','MANAGER'].includes(d.user.roleCode);
      const action=eligible ? (d.user.status==='FROZEN'?'BLOCK':d.user.status==='ACTIVE'?'ALLOW':'HOLD') : 'HOLD';
      return { config: d.config, accountControl:{deviceId:d.id,identity:d.mappedIdentity,action,issuedAt:new Date().toISOString()}, companyId: d.companyId, userId: d.userId, deviceId: d.id };
    });
  }
  async dashboard(user, employeeId, eventType, deviceId) {
    if (employeeId !== undefined && (typeof employeeId !== 'string' || !employeeId.trim() || employeeId.length > 128)) throw new EndpointError(400, 'Invalid employee filter');
    if (eventType !== undefined && !['APPLICATION_ACTIVITY','APPLICATION_USAGE','PROCESS_ACTIVITY'].includes(eventType)) throw new EndpointError(400, 'Invalid activity filter');
    if (deviceId !== undefined && (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 128)) throw new EndpointError(400, 'Invalid device filter');
    if (employeeId && !isEndpointAdmin(user) && employeeId !== user.id) {
      const report = user.roleCode === 'MANAGER' && await this.prisma.user.findFirst({ where: { id: employeeId, managerId: user.id, assignedAdminId: user.assignedAdminId || null, companyId: user.companyId }, select: { id: true } });
      if (!report) throw new EndpointError(403, 'Employee access denied');
    }
    const userId = isEndpointAdmin(user) ? employeeId : (employeeId || user.id);
    const where = { companyId: user.companyId, user: userScope(user), ...(userId ? { userId } : {}) };
    const devices = await this.prisma.endpointDevice.findMany({ where, select: {
      id: true, userId: true, name: true, platform: true, mappedIdentity: true, enrolledAt: true,
      revokedAt: true, lastSeen: true, agentVersion: true, health: true, config: true,
      user: { select: { id: true, name: true, employeeId: true, riskScore: true, trustScore: true, riskLevel: true } }
    }, orderBy: { createdAt: 'desc' } });
    // A device filter must resolve inside the already-scoped company/employee
    // list. This keeps the dashboard filter from becoming an IDOR.
    if (deviceId && !devices.some(d => d.id === deviceId)) throw new EndpointError(404, 'Device not found');
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
    const employees = isEndpointAdmin(user) ? await this.prisma.user.findMany({ where: { ...userScope(user), status: 'ACTIVE', roleCode: { in: ['EMPLOYEE','MANAGER'] } }, select: { id: true, employeeId: true, name: true }, orderBy: { name: 'asc' } }) : [];
    return { devices: devices.map(d => ({ ...d, connectionStatus: d.revokedAt ? 'REVOKED' : !d.enrolledAt ? 'UNENROLLED' : !d.lastSeen || Date.now() - new Date(d.lastSeen).getTime() > 300000 ? 'OFFLINE' : Date.now() - new Date(d.lastSeen).getTime() > 90000 ? 'STALE' : 'CONNECTED' })), employees, events, timeline: { eventType: eventType || null, limit, hasMore }, incidents, ml: ML_AVAILABILITY };
  }
  async change(admin, id, body, revoke = false) {
    if (!admin || !isEndpointAdmin(admin) || admin.status !== 'ACTIVE' || !admin.companyId) throw new EndpointError(403, 'Active administrator required');
    const data = revoke ? { revokedAt: new Date(), credentialHash: null, enrollmentHash: null } : { config: validateConfig(body.config) };
    await this.prisma.$transaction(async tx => {
      const result = await tx.endpointDevice.updateMany({ where: { id, companyId: admin.companyId, user: userScope(admin) }, data });
      if (!result.count) throw new EndpointError(404, 'Device not found');
      await audit(tx, admin, revoke ? 'AGENT_REVOKED' : data.config.paused ? 'AGENT_PAUSED' : 'AGENT_CONFIGURATION_UPDATED', {
        deviceId: id, actorId: admin.id, actorRole: admin.roleCode, isMainAdmin: admin.isMainAdmin === true,
        ...(revoke ? {} : { paused: data.config.paused })
      });
    });
    return { success: true };
  }
}
