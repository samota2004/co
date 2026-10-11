import {randomUUID} from 'node:crypto';
import {prisma} from '../models/prisma.js';
import {db as memory} from '../models/db.js';
import {sseManager} from './sse.js';
import {riskEngine} from '../../cyber/risk-engine/risk-engine.js';
import {evolveTrust} from '../../cyber/zero-trust/trust-engine.js';
import {getPolicy,riskLevel,policyAction} from './policy-service.js';
import {learnBaseline} from './ueba-service.js';
import {SecurityError,scopedUser,publicUser,text,audit,safeMetadata,isAdmin} from './security-common.js';
import {predictWithMLService,registerModel} from './ml-service.js';
const types=new Set(['LOGIN_SUCCESS','LOGIN_FAILED','FILE_ACCESS','FILE_DOWNLOAD','PRIVILEGE_ELEVATION','USB_TRANSFER','POLICY_VIOLATION','MODEL_ASSESSMENT','UNUSUAL_HOURS_ACCESS','CROSS_DEPT_ACCESS','MASS_DOWNLOAD','LOGIN','LOGOUT','FAILED_LOGIN','FILE_UPLOAD','USB_ACTIVITY','APPLICATION_ACCESS','APPLICATION_USAGE','RESOURCE_ACCESS','PRIVILEGE_CHANGE','PASSWORD_CHANGE','MFA_SUCCESS','MFA_FAILURE','CROSS_DEPARTMENT_ACCESS','SUSPICIOUS_DEVICE','UNUSUAL_LOCATION','SHELL_EXECUTION']);
export class SecurityService{
  constructor(client=prisma){this.db=client;}
  async evaluate(actor,raw={},reqContext={}){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SecurityError(400,'INVALID_EVENT','An event object is required.');
    const target=await scopedUser(this.db,actor,raw.userId||actor.id);
    if(!isAdmin(actor)&&target.id!==actor.id)throw new SecurityError(403,'EVENT_SUBMISSION_DENIED','Only administrators may import another employee’s activity.');
    const type=raw.eventType||raw.type||'RESOURCE_ACCESS';if(!types.has(type))throw new SecurityError(400,'INVALID_EVENT_TYPE','Unsupported activity type.');
    const timestamp=new Date(raw.timestamp||Date.now());if(!Number.isFinite(timestamp.getTime())||timestamp>Date.now()+300000||timestamp<Date.now()-31*86400000)throw new SecurityError(400,'INVALID_TIMESTAMP','Timestamp must fall within the last 31 days and five-minute clock tolerance.');
    const metadata=safeMetadata(raw.metadata||{});if(Buffer.byteLength(JSON.stringify(metadata))>8192)throw new SecurityError(400,'INVALID_METADATA','Activity metadata exceeds 8KB.');
    const volume=raw.downloadVolumeMB??raw.downloadSizeMB??metadata.downloadSizeMB??(raw.bytes_sent_kb!==undefined?raw.bytes_sent_kb/1024:0);
    const failed=raw.failedAuthCount??raw.failed_login_attempts??metadata.failedLoginAttempts??0;
    for(const value of [volume,failed])if(!Number.isFinite(value)||value<0||value>1e9)throw new SecurityError(400,'INVALID_ACTIVITY_VALUE','Activity counts must be finite nonnegative numbers.');
    let device,resource;
    if(raw.deviceId){device=await this.db.device.findFirst({where:{userId:target.id,OR:[{id:raw.deviceId},{deviceId:raw.deviceId}]}});if(!device)throw new SecurityError(404,'DEVICE_NOT_FOUND','Device not found for this employee.');}
    if(raw.resourceId){resource=await this.db.resource.findFirst({where:{companyId:actor.companyId,OR:[{id:raw.resourceId},{resourceId:raw.resourceId}]}});if(!resource)throw new SecurityError(404,'RESOURCE_NOT_FOUND','Resource not found in your company.');}
    const eventId=raw.eventId?text(raw.eventId,'Event ID',160):randomUUID();
    let ml=null;
    if(raw.features!==undefined){if(!isAdmin(actor))throw new SecurityError(403,'ML_IMPORT_DENIED','Administrator-authorized aggregate feature import required.');ml=await predictWithMLService(target.id,raw.features);}
    const config=await getPolicy(this.db,actor.companyId),learned=await learnBaseline(this.db,target.id,timestamp);
    const outcome=await this.db.$transaction(async tx=>{
      // Lock the employee row before reading current trust and risk. Concurrent
      // events must not overwrite each other's history or recovery budget.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${target.id} FOR UPDATE`;
      const user=await scopedUser(tx,actor,target.id);
      const duplicate=await tx.activityEvent.findUnique({where:{eventId}});
      if(duplicate){if(duplicate.userId!==user.id)throw new SecurityError(409,'EVENT_ID_CONFLICT','Event ID already belongs to another employee.');return{event:duplicate,duplicate:true,user:publicUser(user),decision:null,ml};}
      const previousIncidents=await tx.incident.count({where:{userId:user.id,status:{notIn:['RESOLVED','FALSE_POSITIVE','REJECTED']}}});
      const approval=resource&&await tx.accessRequest.findFirst({where:{userId:user.id,resourceId:resource.id,status:'APPROVED',decisionTimestamp:{gte:new Date(Date.now()-3600000)}}});
      const dayStart=new Date(timestamp);dayStart.setUTCHours(0,0,0,0);
      const observed=reqContext.aggregateImport?null:await tx.activityEvent.aggregate({where:{userId:user.id,timestamp:{gte:dayStart,lt:new Date(dayStart.getTime()+86400000)}},_sum:{downloadSizeMB:true}});
      const dailyVolume=volume+(observed?observed._sum.downloadSizeMB||0:0);
      const event={...raw,aggregateOnly:reqContext.aggregateImport===true,eventType:type,timestamp:timestamp.toISOString(),metadata,downloadVolumeMB:dailyVolume,failedAuthCount:failed,approvalExists:Boolean(approval)};
      const evaluation=riskEngine.evaluateRisk({...user,baseline:learned.available?learned:null,previousIncidents},event,device,resource,ml,config);
      const observedRisk=evaluation.riskScore;
      const recent=await tx.riskScore.findFirst({where:{userId:user.id},orderBy:{timestamp:'desc'}});
      if(recent&&recent.score>=config.mfaThreshold&&recent.score>observedRisk){
        const held=Array.isArray(recent.factors)&&recent.factors.find(f=>f.category==='RECENT_ASSESSMENT');
        const expiresAt=held?.expiresAt?new Date(held.expiresAt):new Date(recent.timestamp.getTime()+15*60000);
        const reviewed=await tx.auditLog.findFirst({where:{userId:user.id,action:'ACCOUNT_RESTORED',timestamp:{gte:recent.timestamp}}});
        if(!reviewed&&expiresAt>Date.now()){
          const description='A recorded elevated assessment remains active until '+expiresAt.toISOString()+'. A clean request alone does not bypass its policy.';
          evaluation.contributingFactors.push({factor:'Recent elevated assessment',scoreImpact:recent.score-observedRisk,category:'RECENT_ASSESSMENT',description,expiresAt:expiresAt.toISOString()});
          evaluation.riskScore=recent.score;evaluation.riskLevel=riskLevel(recent.score,config);
          evaluation.recommendedAction=policyAction(recent.score,config);evaluation.explanationText+=' '+description;
        }
      }
      let decision=evaluation.recommendedAction;
      if(['FROZEN','DISABLED'].includes(user.status))decision='FREEZE';
      else if(resource&&!resource.requiredRoles.includes(user.roleCode)&&!approval&&!isAdmin(user))decision='RESTRICT';
      else if(decision==='MFA'&&reqContext.mfaFresh)decision='MONITOR';
      else if(decision==='REQUIRE_APPROVAL'&&approval)decision='MONITOR';
      const canRecover=!user.trustUpdatedAt||Date.now()-user.trustUpdatedAt.getTime()>3600000;
      // Trust follows newly observed signals. A policy hold must not repeatedly
      // punish an employee for the same historical observation.
      const trust=evolveTrust(user.trustScore,observedRisk,config,canRecover);
      const nextStatus=decision==='FREEZE'?'FROZEN':decision==='RESTRICT'?'RESTRICTED':user.status;
      const updated=await tx.user.update({where:{id:user.id},data:{riskScore:evaluation.riskScore,riskLevel:evaluation.riskLevel,trustScore:trust,...(trust!==user.trustScore?{trustUpdatedAt:new Date()}:{}),...(nextStatus!==user.status?{status:nextStatus,authVersion:{increment:1}}:{})}});
      if(['FREEZE','RESTRICT'].includes(decision))await tx.session.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:new Date()}});
      const record=await tx.activityEvent.create({data:{eventId,userId:user.id,userEmail:user.email,userRole:user.roleCode,type,timestamp,ip:reqContext.ip||raw.ipAddress||raw.ip||'Unknown',location:raw.location||'Unknown',deviceId:device?.id,deviceName:device?.name,resourceId:resource?.id,resourceName:resource?.name,severity:evaluation.riskLevel,riskContribution:evaluation.riskScore,mlAnomalyScore:evaluation.mlAnomalyScore,isOffHours:evaluation.isOffHours,isCrossDepartment:evaluation.isCrossDepartment,downloadSizeMB:volume,failedAttempts:Math.floor(failed),metadata:{...metadata,source:raw.source||'application',evaluation:{...evaluation,trustScore:trust},decision,...(ml?{ml:{threat_probability:ml.threat_probability,xai_reasons:ml.xai_reasons,operating_threshold:ml.operating_threshold}}:{})}}});
      await tx.riskScore.create({data:{userId:user.id,sourceEventId:eventId,score:evaluation.riskScore,level:evaluation.riskLevel,factors:evaluation.contributingFactors,anomalyScore:evaluation.mlAnomalyScore,policyAction:decision,timestamp}});
      await tx.trustHistory.create({data:{userId:user.id,trustScore:trust,riskScore:evaluation.riskScore,delta:trust-user.trustScore,reason:evaluation.explanationText,timestamp}});
      if(ml){const version=await registerModel(tx);await tx.mlPrediction.create({data:{userId:user.id,modelVersionId:version.id,featureVector:raw.features,anomalyScore:ml.threat_probability,isAnomalous:Boolean(ml.predicted_class),riskScore:evaluation.riskScore,attributions:ml.xai_reasons||[],timestamp}});}
      let incident;
      if(evaluation.riskScore>=config.mfaThreshold||Boolean(ml?.predicted_class)||['RESTRICT','FREEZE'].includes(decision)){
        incident=await tx.incident.create({data:{incidentId:randomUUID(),userId:user.id,userEmail:user.email,title:`${type} requires security review`,severity:evaluation.riskLevel==='VERY_HIGH'?'HIGH':evaluation.riskLevel==='CRITICAL'?'CRITICAL':'MEDIUM',status:'OPEN',riskScore:evaluation.riskScore,contributingFactors:evaluation.contributingFactors.map(f=>f.factor),aiExplanation:evaluation.explanationText,recommendedAction:decision,activityEvents:{connect:{id:record.id}}}});
      }
      let request;
      if(decision==='REQUIRE_APPROVAL'&&resource){request=await tx.accessRequest.findFirst({where:{userId:user.id,resourceId:resource.id,status:'PENDING'}});if(!request)request=await tx.accessRequest.create({data:{requestId:randomUUID(),userId:user.id,resourceId:resource.id,justification:'Zero Trust policy requires review.',riskAtRequest:evaluation.riskScore,aiRiskAssessment:evaluation.explanationText}});}
      if(resource&&['ALLOW','MONITOR'].includes(decision))await tx.resource.update({where:{id:resource.id},data:{accessCount:{increment:1}}});
      await audit(tx,actor,'POLICY_DECISION',{eventId,decision,riskScore:evaluation.riskScore,factors:evaluation.contributingFactors},user.id);
      return{event:{...record,id:record.id,eventType:type,userName:user.name,companyId:actor.companyId},user:publicUser(updated),decision:{decision,allowed:['ALLOW','MONITOR'].includes(decision),requiresMfa:decision==='MFA',requiresApproval:decision==='REQUIRE_APPROVAL',isRestricted:['RESTRICT','FREEZE','REQUIRE_APPROVAL'].includes(decision),isFrozen:decision==='FREEZE',reason:evaluation.explanationText,evaluation:{...evaluation,trustScore:trust},incidentCreated:incident},incident,request,ml:ml||{available:false,reason:'Complete approved user-day model features were not supplied. Contextual assessment only.'},baseline:learned};
    });
    if(!outcome.duplicate){memory.users=memory.users.map(u=>u.id===outcome.user.id?{...u,...outcome.user}:u);sseManager.broadcastActivity(outcome.event);sseManager.broadcastRiskChange(outcome.user.id,outcome.user.riskScore,outcome.user.riskLevel,outcome.user);sseManager.broadcastTrustChange(outcome.user.id,outcome.user.trustScore,outcome.user);if(outcome.incident)sseManager.broadcastIncident({...outcome.incident,companyId:actor.companyId},true);if(outcome.request)sseManager.broadcastAccessRequest({...outcome.request,companyId:actor.companyId},true);}
    return outcome;
  }
}
export const securityService=new SecurityService();
