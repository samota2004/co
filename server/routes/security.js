import {monitoringInclude, monitoredUser} from '../services/monitoring-state.js';
import {releaseDeletedIdentifiers} from '../services/deleted-identifiers.js';
import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {prisma,Prisma} from '../models/prisma.js';
import {requireAuth,requireSecurityAdmin} from '../middleware/auth.js';
import {api,SecurityError,userScope,scopedUser,publicUser,pagination,text,audit,isAdmin} from '../services/security-common.js';
import {getPolicy,savePolicy} from '../services/policy-service.js';
import {securityService} from '../services/security-service.js';
import {getRiskAnalysis} from '../services/risk-analysis-service.js';
import {learnBaseline} from '../services/ueba-service.js';
import {sseManager} from '../services/sse.js';
import {sendExport} from '../services/export-service.js';
import {createLiveModelDataReadiness} from '../services/ml-data-readiness.js';
const router=Router();router.use(requireAuth);
const subjectScope=req=>({user:userScope(req.user)});
const decorateEvent=e=>({...e,eventType:e.type,userName:e.user?.name,ipAddress:e.ip,...(e.metadata?.evaluation||{}),policyAction:e.metadata?.decision,xaiReasons:e.metadata?.ml?.xai_reasons||[],mlThreatProbability:e.metadata?.ml?.threat_probability??null});
const decorateResource=r=>{const{protectedData,...catalog}=r;return{...catalog,hasProtectedData:protectedData!==null&&protectedData!==undefined,department:r.departmentCode};};
const decorateRequest=r=>({...r,reason:r.justification,userName:r.user?.name,resourceName:r.resource?.name,requestedAt:r.createdAt,riskScoreAtRequest:r.riskAtRequest,reviewNotes:r.decisionReason,reviewedAt:r.decisionTimestamp});

router.get('/assignment-options',requireSecurityAdmin,api(async req=>({
  administrators:await prisma.user.findMany({where:{companyId:req.user.companyId,deletedAt:null,status:'ACTIVE',roleCode:{in:['SECURITY_ADMIN','SYSTEM_ADMIN']},...(req.user.isMainAdmin?{}:{id:req.user.id})},select:{id:true,name:true},orderBy:{name:'asc'}}),
  managers:await prisma.user.findMany({where:{...userScope(req.user),roleCode:'MANAGER',status:'ACTIVE',assignedAdmin:{is:{deletedAt:null,status:'ACTIVE',roleCode:{in:['SECURITY_ADMIN','SYSTEM_ADMIN']},companyId:req.user.companyId}}},select:{id:true,name:true,assignedAdminId:true},orderBy:{name:'asc'}}),
  canReassign:req.user.isMainAdmin===true
})));
router.get('/users',api(async req=>({users:(await prisma.user.findMany({where:{...userScope(req.user),roleCode:{in:['EMPLOYEE','MANAGER']}},orderBy:{name:'asc'},include:monitoringInclude(),...pagination(req.query)})).map(monitoredUser)})));
router.get('/users/:id',api(async req=>{
  const u=await scopedUser(prisma,req.user,req.params.id);
  const [devices,events,trustHistory,riskHistory,baseline,incidents]=await Promise.all([prisma.device.findMany({where:{userId:u.id}}),prisma.activityEvent.findMany({where:{userId:u.id},orderBy:{timestamp:'desc'},take:100}),prisma.trustHistory.findMany({where:{userId:u.id},orderBy:{timestamp:'desc'},take:200}),prisma.riskScore.findMany({where:{userId:u.id},orderBy:{timestamp:'desc'},take:200}),prisma.behaviorProfile.findUnique({where:{userId:u.id}}),isAdmin(req.user)||req.user.roleCode==='MANAGER'?prisma.incident.findMany({where:{userId:u.id},orderBy:{createdAt:'desc'},take:50}):[]]);
  return{user:monitoredUser(await prisma.user.findUnique({where:{id:u.id},include:monitoringInclude()})),devices:devices.map(({fingerprint,...d})=>d),events:events.map(decorateEvent),trustHistory:trustHistory.reverse(),riskHistory:riskHistory.reverse(),baseline:baseline?.sampleDays>=7?baseline:{available:false,reason:'Insufficient observed history'},incidents};
}));
async function userChanges(req,create=false,current=null){
  const b=req.body||{},fields={};
  if(b.password!==undefined||b.passwordHash!==undefined)throw new SecurityError(400,'EMPLOYEE_PASSWORD_NOT_ALLOWED','Employees are monitoring identities and cannot have console passwords. Refresh the employee form and submit without a password.');
  if(b.status!==undefined){if(!['ACTIVE','RESTRICTED','FROZEN','DISABLED','INVESTIGATION'].includes(b.status))throw new SecurityError(400,'INVALID_STATUS','Invalid account status.');fields.status=b.status;}
  for(const k of ['name','employeeId'])if(create||b[k]!==undefined)fields[k]=text(b[k],k,100);
  if(create||b.email!==undefined){fields.email=text(b.email,'Email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))throw new SecurityError(400,'INVALID_EMAIL','Enter a valid email.');}
  if(create||b.departmentCode!==undefined||b.department!==undefined){fields.departmentCode=b.departmentCode||b.department;if(!await prisma.department.findUnique({where:{code:fields.departmentCode}}))throw new SecurityError(400,'INVALID_DEPARTMENT','Select an existing department.');}
  if(create||b.roleCode!==undefined||b.role!==undefined){fields.roleCode=b.roleCode||b.role||'EMPLOYEE';if(!['EMPLOYEE','MANAGER'].includes(fields.roleCode))throw new SecurityError(400,'INVALID_ROLE','Use Admin Management to manage administrator roles.');}
  const hierarchyChanged=create||b.managerId!==undefined||b.assignedAdminId!==undefined||b.role!==undefined||b.roleCode!==undefined;
  if(hierarchyChanged){
    for(const key of ['managerId','assignedAdminId'])if(b[key]!==undefined&&b[key]!==null&&b[key]!==''&&(typeof b[key]!=='string'||b[key].length>128))throw new SecurityError(400,'INVALID_ASSIGNMENT','Select a valid manager or administrator.');
    const role=fields.roleCode||current?.roleCode;
    if(role==='EMPLOYEE'){
      const managerId=b.managerId!==undefined?b.managerId:current?.managerId;
      if(!managerId)throw new SecurityError(400,'MANAGER_REQUIRED','Select a manager for this employee.');
      const manager=await prisma.user.findFirst({where:{id:managerId,...userScope(req.user),roleCode:'MANAGER',status:'ACTIVE'},include:{assignedAdmin:true}});
      if(!manager||!manager.assignedAdmin||manager.assignedAdmin.companyId!==req.user.companyId||(manager.assignedAdmin.deletedAt||manager.assignedAdmin.status!=='ACTIVE')||!isAdmin(manager.assignedAdmin))throw new SecurityError(400,'INVALID_MANAGER','Select a manager with an active assigned administrator.');
      if(b.assignedAdminId&&b.assignedAdminId!==manager.assignedAdminId)throw new SecurityError(400,'MANAGER_ADMIN_MISMATCH','The employee inherits their manager’s administrator.');
      fields.managerId=manager.id;fields.assignedAdminId=manager.assignedAdminId;
    }else{
      if(b.managerId)throw new SecurityError(400,'INVALID_MANAGER','Managers are assigned directly to an administrator.');
      const assignedId=b.assignedAdminId!==undefined?b.assignedAdminId:(current?.assignedAdminId||(!req.user.isMainAdmin?req.user.id:null));
      if(!assignedId)throw new SecurityError(400,'ADMINISTRATOR_REQUIRED','Select an administrator for this manager.');
      if(!req.user.isMainAdmin&&assignedId!==req.user.id)throw new SecurityError(403,'MAIN_ADMIN_REQUIRED','Only the main admin can assign a different administrator.');
      if(!await prisma.user.findFirst({where:{id:assignedId,companyId:req.user.companyId,deletedAt:null,status:'ACTIVE',roleCode:{in:['SECURITY_ADMIN','SYSTEM_ADMIN']}}}))throw new SecurityError(400,'INVALID_ADMINISTRATOR','Select an active administrator in your company.');
      fields.managerId=null;fields.assignedAdminId=assignedId;
    }
  }
  return fields;
}
router.post('/users',requireSecurityAdmin,api(async req=>{const fields=await userChanges(req,true);const user=await prisma.$transaction(async tx=>{await releaseDeletedIdentifiers(tx,req.user,fields);const u=await tx.user.create({data:{...fields,companyId:req.user.companyId,riskScore:0,trustScore:100}});await audit(tx,req.user,'USER_CREATED',{employeeId:u.employeeId},u.id);return u;});return{user:publicUser(user)};}));
router.patch('/users/:id',requireSecurityAdmin,api(async req=>{const u=await scopedUser(prisma,req.user,req.params.id);if(isAdmin(u))throw new SecurityError(403,'ADMIN_MANAGEMENT_REQUIRED','Use Admin Management for this account.');const fields=await userChanges(req,false,u);if(fields.managerId===u.id)throw new SecurityError(400,'INVALID_MANAGER','An employee cannot manage themselves.');const user=await prisma.$transaction(async tx=>{if(u.roleCode==='MANAGER'&&fields.roleCode==='EMPLOYEE'&&await tx.user.count({where:{managerId:u.id}}))throw new SecurityError(400,'MANAGER_HAS_REPORTS','Reassign this manager’s employees before changing their role.');
const updated=await tx.user.update({where:{id:u.id},data:{...fields,authVersion:{increment:1}}});
if(updated.roleCode==='MANAGER'&&fields.assignedAdminId!==undefined&&fields.assignedAdminId!==u.assignedAdminId){
  await tx.user.updateMany({where:{managerId:u.id,companyId:req.user.companyId,roleCode:'EMPLOYEE'},data:{assignedAdminId:fields.assignedAdminId,authVersion:{increment:1}}});
  await audit(tx,req.user,'TEAM_ADMINISTRATOR_CHANGED',{managerId:u.id,previousAdminId:u.assignedAdminId,assignedAdminId:fields.assignedAdminId},u.id);
}
await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});await audit(tx,req.user,'USER_UPDATED',{fields:Object.keys(fields),...(fields.assignedAdminId!==undefined?{previousAdminId:u.assignedAdminId,assignedAdminId:fields.assignedAdminId}: {})},u.id);return updated;});return{user:publicUser(user)};}));
export async function setAccount(req,status){if(!isAdmin(req.user)||req.user.status!=='ACTIVE'||!req.user.companyId)throw new SecurityError(403,'ADMIN_REQUIRED','Only an active administrator can change account restrictions.');const u=await scopedUser(prisma,req.user,req.params.id);if(isAdmin(u))throw new SecurityError(403,'ADMIN_MANAGEMENT_REQUIRED','Use Admin Management for this account.');const user=await prisma.$transaction(async tx=>{const updated=await tx.user.update({where:{id:u.id},data:{status,authVersion:{increment:1}}});await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});await audit(tx,req.user,status==='ACTIVE'?'ACCOUNT_RESTORED':'ACCOUNT_RESTRICTED',{status,reason:String(req.body?.reason||'Administrative security review').slice(0,500)},u.id);return updated;});sseManager.broadcastAccountStatus(user.id,status,publicUser(user));return{user:publicUser(user),message:status==='ACTIVE'?'Account restored. Locally approved endpoint agents will restore sign-in on their next successful heartbeat; verify the device report.':'Account restricted and console sessions invalidated. FROZEN status is applied to supported local OS accounts only by locally approved agents; verify the device report.'};}
router.post('/users/:id/freeze',requireSecurityAdmin,api(req=>setAccount(req,'FROZEN')));
router.post('/users/:id/unfreeze',requireSecurityAdmin,api(req=>setAccount(req,'ACTIVE')));
router.delete('/users/:id',requireSecurityAdmin,api(async req=>{
  const u=await scopedUser(prisma,req.user,req.params.id);
  if(isAdmin(u))throw new SecurityError(403,'ADMIN_MANAGEMENT_REQUIRED','Use Admin Management for this account.');
  await prisma.$transaction(async tx=>{
    await tx.user.update({where:{id:u.id},data:{deletedAt:new Date(),status:'DISABLED',authVersion:{increment:1}}});
    await tx.session.updateMany({where:{userId:u.id,revokedAt:null},data:{revokedAt:new Date()}});
    await tx.user.updateMany({where:{companyId:req.user.companyId,managerId:u.id},data:{managerId:null}});
    await audit(tx,req.user,'ACCOUNT_DELETED',{role:u.roleCode,historyRetained:true},u.id);
  });
  return{deletedId:u.id,message:'Account deleted from the directory. Security history is retained.'};
}));

router.get('/policies',requireSecurityAdmin,api(async req=>({config:await getPolicy(prisma,req.user.companyId)})));
router.patch('/policies/:id?',requireSecurityAdmin,api(async req=>{const result=await savePolicy(prisma,req.user,req.body);sseManager.broadcast('POLICY_UPDATED',{companyId:req.user.companyId,config:result.config});return result;}));
router.get('/resources',api(async req=>({resources:(await prisma.resource.findMany({where:{companyId:req.user.companyId},...pagination(req.query)})).map(decorateResource)})));
router.get('/resources/:id',api(async req=>{const resource=await prisma.resource.findFirst({where:{id:req.params.id,companyId:req.user.companyId}});if(!resource)throw new SecurityError(404,'RESOURCE_NOT_FOUND','Resource not found.');return{resource:decorateResource(resource)};}));
async function resourceFields(req){const b=req.body,name=text(b.name,'Resource name',100),departmentCode=b.departmentCode||b.department,sensitivity=b.sensitivity||'INTERNAL',requiredRoles=b.requiredRoles||['EMPLOYEE','MANAGER'];if(!await prisma.department.findUnique({where:{code:departmentCode}})||!['PUBLIC','INTERNAL','CONFIDENTIAL','HIGHLY_SENSITIVE'].includes(sensitivity)||!Array.isArray(requiredRoles)||!requiredRoles.length||requiredRoles.some(r=>!['EMPLOYEE','MANAGER','SECURITY_ADMIN','SYSTEM_ADMIN'].includes(r)))throw new SecurityError(400,'INVALID_RESOURCE','Invalid department, sensitivity or roles.');if(b.protectedData!==undefined&&b.protectedData!==null&&(typeof b.protectedData!=='object'||Array.isArray(b.protectedData)||Buffer.byteLength(JSON.stringify(b.protectedData))>16384))throw new SecurityError(400,'INVALID_RESOURCE_DATA','Protected resource data must be a JSON object of at most 16KB.');return{name,departmentCode,sensitivity,requiredRoles,description:String(b.description||'').slice(0,2000),...(b.protectedData!==undefined?{protectedData:b.protectedData===null?Prisma.DbNull:b.protectedData}:{})};}
router.post('/resources',requireSecurityAdmin,api(async req=>{const fields=await resourceFields(req);const resource=await prisma.$transaction(async tx=>{const r=await tx.resource.create({data:{...fields,resourceId:randomUUID(),companyId:req.user.companyId}});await audit(tx,req.user,'RESOURCE_CREATED',{id:r.id});return r;});return{resource:decorateResource(resource)};}));
router.patch('/resources/:id',requireSecurityAdmin,api(async req=>{const r=await prisma.resource.findFirst({where:{id:req.params.id,companyId:req.user.companyId}});if(!r)throw new SecurityError(404,'RESOURCE_NOT_FOUND','Resource not found.');const fields=await resourceFields({...req,body:{...r,...req.body}});const resource=await prisma.$transaction(async tx=>{const updated=await tx.resource.update({where:{id:r.id},data:fields});await audit(tx,req.user,'RESOURCE_UPDATED',{id:r.id});return updated;});return{resource:decorateResource(resource)};}));
const accessInput=req=>isAdmin(req.user)?req.body:{userId:req.user.id,resourceId:req.body.resourceId,eventType:'RESOURCE_ACCESS',deviceId:req.authClaims?.deviceId||undefined};
const assess=req=>securityService.evaluate(req.user,accessInput(req),{ip:req.ip,mfaFresh:req.authSession?.mfaVerifiedAt&&Date.now()-req.authSession.mfaVerifiedAt.getTime()<15*60000,simulation:req.path.endsWith('/test-access')||req.path==='/risk/evaluate'});
router.post('/resources/test-access',api(assess));
router.post('/activity/test-access',api(assess));
router.post('/resources/:id/access',api(async req=>{
 // Protected data is always assessed for the authenticated principal using
 // server-observed context. Admin scenario imports use test-access instead.
 const result=await securityService.evaluate(req.user,{userId:req.user.id,deviceId:req.authClaims?.deviceId,resourceId:req.params.id,eventType:'RESOURCE_ACCESS'},{ip:req.ip,mfaFresh:req.authSession?.mfaVerifiedAt&&Date.now()-req.authSession.mfaVerifiedAt.getTime()<15*60000,authenticatedResourceAccess:true});
 return result;
}));
router.get('/activity',api(async req=>({events:(await prisma.activityEvent.findMany({where:subjectScope(req),include:{user:{select:{name:true}}},orderBy:{timestamp:'desc'},...pagination(req.query)})).map(decorateEvent)})));
router.get('/activity/:id',api(async req=>{const event=await prisma.activityEvent.findFirst({where:{id:req.params.id,...subjectScope(req)}});if(!event)throw new SecurityError(404,'EVENT_NOT_FOUND','Event not found.');return{event:decorateEvent(event)};}));
router.post('/activity',requireSecurityAdmin,api(assess));
router.post('/telemetry/ingest',requireSecurityAdmin,api(async()=>{
  // General application telemetry has no verified mapping to the model's
  // five source-specific daily logs. Do not turn event names into RF features.
  throw new SecurityError(400,'ML_DATA_INCOMPLETE','Generic telemetry cannot produce a notebook-compatible 21-feature aggregate. No prediction or risk update was made.',createLiveModelDataReadiness());
}));
router.post('/risk/evaluate',requireSecurityAdmin,api(assess));
router.get('/risk/analysis/:id',requireSecurityAdmin,api(async req=>({analysis:await getRiskAnalysis(prisma,req.user,req.params.id)})));
router.get('/risk/users/:id',api(async req=>{const u=await scopedUser(prisma,req.user,req.params.id);return{userId:u.id,riskScore:u.riskScore,riskLevel:u.riskLevel,latest:await prisma.riskScore.findFirst({where:{userId:u.id},orderBy:{timestamp:'desc'}})};}));
router.get('/risk/history/:id',api(async req=>{const u=await scopedUser(prisma,req.user,req.params.id);return{history:await prisma.riskScore.findMany({where:{userId:u.id},orderBy:{timestamp:'desc'},...pagination(req.query)})};}));
router.get('/trust/:id/history',api(async req=>{const u=await scopedUser(prisma,req.user,req.params.id);return{history:await prisma.trustHistory.findMany({where:{userId:u.id},orderBy:{timestamp:'desc'},...pagination(req.query)})};}));
router.get('/trust/:id',api(async req=>{const u=await scopedUser(prisma,req.user,req.params.id);return{trustScore:u.trustScore};}));
router.post('/users/:id/baseline/rebuild',requireSecurityAdmin,api(async req=>{const u=await scopedUser(prisma,req.user,req.params.id);return{baseline:await learnBaseline(prisma,u.id)};}));

router.get('/access-requests',api(async req=>({requests:(await prisma.accessRequest.findMany({where:subjectScope(req),include:{user:{select:{name:true}},resource:{select:{name:true}}},orderBy:{createdAt:'desc'},...pagination(req.query)})).map(decorateRequest)})));
router.post('/access-requests',api(async req=>{const u=await scopedUser(prisma,req.user,req.body.userId||req.user.id);if(!isAdmin(req.user)&&u.id!==req.user.id)throw new SecurityError(403,'REQUEST_DENIED','Request access only for yourself.');const resource=await prisma.resource.findFirst({where:{id:req.body.resourceId,companyId:req.user.companyId}});if(!resource)throw new SecurityError(404,'RESOURCE_NOT_FOUND','Resource not found.');const justification=text(req.body.reason||req.body.justification,'Reason',1000);const request=await prisma.$transaction(async tx=>{const r=await tx.accessRequest.create({data:{requestId:randomUUID(),userId:u.id,resourceId:resource.id,justification,riskAtRequest:u.riskScore,aiRiskAssessment:'Current stored risk '+u.riskScore+'; trust '+u.trustScore+'.'}});await audit(tx,req.user,'ACCESS_REQUESTED',{requestId:r.id},u.id);return r;});return{request:decorateRequest(request)};}));
for(const [action,status]of [['approve','APPROVED'],['reject','REJECTED']])router.post('/access-requests/:id/'+action,api(async req=>{
  if(!isAdmin(req.user)&&req.user.roleCode!=='MANAGER')throw new SecurityError(403,'REVIEW_DENIED','An authorized reviewer is required.');
  const request=await prisma.accessRequest.findFirst({where:{id:req.params.id,...subjectScope(req)},include:{user:true,resource:true}});
  if(!request)throw new SecurityError(404,'REQUEST_NOT_FOUND','Request not found.');
  if(request.userId===req.user.id)throw new SecurityError(403,'SELF_APPROVAL_DENIED','You cannot review your own access request.');
  if(req.user.roleCode==='MANAGER'&&(request.riskAtRequest>=(await getPolicy(prisma,req.user.companyId)).approvalThreshold||request.resource.sensitivity==='HIGHLY_SENSITIVE'))throw new SecurityError(403,'SECURITY_REVIEW_REQUIRED','High-risk or highly sensitive access requires security administration.');
  const updated=await prisma.$transaction(async tx=>{const changed=await tx.accessRequest.updateMany({where:{id:request.id,status:'PENDING'},data:{status,reviewedBy:req.user.id,decisionTimestamp:new Date(),decisionReason:String(req.body.notes||'Reviewed').slice(0,1000)}});if(changed.count!==1)throw new SecurityError(409,'REQUEST_ALREADY_REVIEWED','Request was already reviewed.');await audit(tx,req.user,'ACCESS_'+status,{requestId:request.id},request.userId);return tx.accessRequest.findUnique({where:{id:request.id},include:{user:{select:{name:true}},resource:{select:{name:true}}}});});
  sseManager.broadcastAccessRequest({...decorateRequest(updated),companyId:req.user.companyId});return{request:decorateRequest(updated)};
}));

router.get('/incidents',api(async req=>{if(!isAdmin(req.user)&&req.user.roleCode!=='MANAGER')throw new SecurityError(403,'INVESTIGATION_DENIED','Investigation access required.');return{incidents:await prisma.incident.findMany({where:subjectScope(req),include:{user:{select:{name:true,departmentCode:true}}},orderBy:{createdAt:'desc'},...pagination(req.query)})};}));
router.get('/incidents/export',requireSecurityAdmin,async(req,res,next)=>{try{const where={user:userScope(req.user)};if(req.query.status&&req.query.status!=='ALL'){if(!['OPEN','UNDER_REVIEW','APPROVED','REJECTED','RESOLVED','FALSE_POSITIVE','INVESTIGATING','CONTAINED','NEW'].includes(req.query.status))throw new SecurityError(400,'INVALID_STATUS','Invalid incident status filter.');where.status=req.query.status;}if(req.query.severity&&req.query.severity!=='ALL'){if(!['LOW','MEDIUM','HIGH','CRITICAL'].includes(req.query.severity))throw new SecurityError(400,'INVALID_SEVERITY','Invalid incident severity filter.');where.severity=req.query.severity;}const rows=await prisma.incident.findMany({where,orderBy:{createdAt:'desc'},take:5000});await audit(prisma,req.user,'INCIDENT_EXPORT',{rows:rows.length,limit:5000});sendExport(req,res,rows,['id','title','severity','status','userId','riskScore','createdAt','recommendedAction','resolutionNotes'],'cyberorbit-incidents');}catch(e){next(e);}});
router.get('/incidents/:id',api(async req=>{if(!isAdmin(req.user)&&req.user.roleCode!=='MANAGER')throw new SecurityError(403,'INVESTIGATION_DENIED','Investigation access required.');const incident=await prisma.incident.findFirst({where:{id:req.params.id,...subjectScope(req)},include:{activityEvents:true}});if(!incident)throw new SecurityError(404,'INCIDENT_NOT_FOUND','Incident not found.');return{incident};}));
router.post('/incidents/:id/ai-explain',requireSecurityAdmin,api(async req=>{const i=await prisma.incident.findFirst({where:{id:req.params.id,user:userScope(req.user)}});if(!i)throw new SecurityError(404,'INCIDENT_NOT_FOUND','Incident not found.');return{explanation:i.aiExplanation||'No recorded assessment explanation is available.',aiExplanation:i.aiExplanation||'No recorded assessment explanation is available.',source:'stored-policy-factors',advisory:true};}));
async function updateIncident(req,status){const incident=await prisma.incident.findFirst({where:{id:req.params.id,user:userScope(req.user)}});if(!incident)throw new SecurityError(404,'INCIDENT_NOT_FOUND','Incident not found.');if(!['OPEN','UNDER_REVIEW','APPROVED','REJECTED','RESOLVED','FALSE_POSITIVE','INVESTIGATING','CONTAINED'].includes(status))throw new SecurityError(400,'INVALID_INCIDENT_STATUS','Invalid incident status.');const reviewed=['RESOLVED','FALSE_POSITIVE'].includes(status);const result=await prisma.$transaction(async tx=>{const i=await tx.incident.update({where:{id:incident.id},data:{status,resolutionNotes:String(req.body.notes||req.body.resolutionNotes||'').slice(0,2000),resolvedAt:reviewed?new Date():null,resolvedBy:reviewed?req.user.id:null}});await audit(tx,req.user,'INCIDENT_'+status,{incidentId:i.id},incident.userId);return i;});sseManager.broadcastIncident({...result,companyId:req.user.companyId});return{incident:result};}
router.patch('/incidents/:id',requireSecurityAdmin,api(req=>updateIncident(req,req.body.status)));
router.post('/incidents/:id/resolve',requireSecurityAdmin,api(req=>updateIncident(req,req.body.newStatus||'RESOLVED')));

function auditFilter(req){
 const where={companyId:req.user.companyId,...(req.user.isMainAdmin?{}:{user:userScope(req.user)})};
 for(const k of ['category','severity','userId','action'])if(req.query[k]&&req.query[k]!=='ALL')where[k]=text(req.query[k],k,128);
 if(where.severity&&!['INFO','LOW','MEDIUM','HIGH','VERY_HIGH','CRITICAL'].includes(where.severity))throw new SecurityError(400,'INVALID_SEVERITY','Invalid severity filter.');
 if(req.query.search){const search=text(req.query.search,'Search',128);where.OR=[{action:{contains:search,mode:'insensitive'}},{details:{contains:search,mode:'insensitive'}}];}
 if(req.query.from||req.query.to){where.timestamp={};for(const [q,k]of [['from','gte'],['to','lte']])if(req.query[q]){const d=new Date(req.query[q]);if(!Number.isFinite(d.getTime()))throw new SecurityError(400,'INVALID_DATE','Invalid date filter.');where.timestamp[k]=d;}}
 return where;
}
router.get('/audit-logs/export',requireSecurityAdmin,async(req,res,next)=>{try{
 const rows=await prisma.auditLog.findMany({where:auditFilter(req),orderBy:{timestamp:'desc'},take:5000});
 await audit(prisma,req.user,'AUDIT_EXPORT',{rows:rows.length,limit:5000});
 sendExport(req,res,rows,['id','timestamp','userId','action','category','severity','details'],'cyberorbit-audit');
}catch(e){next(e);}});
router.get('/audit-logs',requireSecurityAdmin,api(async req=>{
 const where=auditFilter(req);
 const [auditLogs,total]=await Promise.all([prisma.auditLog.findMany({where,orderBy:{timestamp:'desc'},...pagination(req.query)}),prisma.auditLog.count({where})]);
 return{auditLogs,total};
}));

router.get('/dashboard/:section',requireSecurityAdmin,api(async req=>{
 const where=userScope(req.user),scope={user:where},policy=await getPolicy(prisma,req.user.companyId);
 if(req.params.section==='summary'){const [users,activeUsers,highRiskUsers,restrictedAccounts,pendingApprovals,criticalAlerts]=await Promise.all([prisma.user.count({where}),prisma.user.count({where:{...where,status:'ACTIVE'}}),prisma.user.count({where:{...where,riskScore:{gte:policy.mfaThreshold}}}),prisma.user.count({where:{...where,status:{in:['FROZEN','RESTRICTED','INVESTIGATION']}}}),prisma.accessRequest.count({where:{...scope,status:'PENDING'}}),prisma.incident.count({where:{...scope,severity:'CRITICAL',status:{not:'RESOLVED'}}})]);return{summary:{users,activeUsers,highRiskUsers,restrictedAccounts,pendingApprovals,criticalAlerts}};}
 if(req.params.section==='risk-distribution')return{distribution:await prisma.user.groupBy({by:['riskLevel'],where,_count:{_all:true}})};
 if(req.params.section==='risk-trends')return{history:await prisma.riskScore.findMany({where:{...scope,timestamp:{gte:new Date(Date.now()-30*86400000)}},orderBy:{timestamp:'asc'},take:2000})};
 if(req.params.section==='recent-alerts')return{incidents:await prisma.incident.findMany({where:scope,orderBy:{createdAt:'desc'},take:30})};
 throw new SecurityError(404,'DASHBOARD_SECTION_NOT_FOUND','Dashboard section not found.');
}));
export default router;
