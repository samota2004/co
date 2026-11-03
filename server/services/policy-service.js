import {SecurityError,audit} from './security-common.js';
export const DEFAULT_POLICY=Object.freeze({lowRiskMax:39,mediumRiskMax:59,highRiskMax:74,veryHighRiskMax:89,criticalThreshold:90,mfaThreshold:60,approvalThreshold:75,restrictionThreshold:90,freezeThreshold:90,autoFreezeOnCritical:false,automaticContainmentMinEvidenceCategories:2,automaticContainmentMaxEvidenceAgeSeconds:300,crossDeptRiskPenalty:28,untrustedDevicePenalty:25,offHoursPenalty:20,largeDownloadThresholdMB:150,adaptiveTrustRecoveryRate:1,mlWeight:35});
export function validatePolicy(updates,base=DEFAULT_POLICY){
  if(!updates||typeof updates!=='object'||Array.isArray(updates)||Object.keys(updates).some(k=>!(k in DEFAULT_POLICY)))throw new SecurityError(400,'INVALID_POLICY','Unknown policy setting.');
  const c={...base,...updates};
  for(const[k,v]of Object.entries(c))if(k==='autoFreezeOnCritical'?typeof v!=='boolean':k==='automaticContainmentMinEvidenceCategories'? !Number.isInteger(v)||v<2||v>8:k==='automaticContainmentMaxEvidenceAgeSeconds'? !Number.isInteger(v)||v<30||v>300:!Number.isFinite(v)||v<0||v>(k==='largeDownloadThresholdMB'?1000000:100))throw new SecurityError(400,'INVALID_POLICY',`Invalid policy value: ${k}.`);
  if(!(c.lowRiskMax<c.mediumRiskMax&&c.mediumRiskMax<c.highRiskMax&&c.highRiskMax<c.veryHighRiskMax&&c.veryHighRiskMax<c.criticalThreshold&&c.mfaThreshold<c.approvalThreshold&&c.approvalThreshold<=c.restrictionThreshold&&c.restrictionThreshold<=c.freezeThreshold))throw new SecurityError(400,'INVALID_THRESHOLDS','Risk bands and action thresholds must be logically ordered.');
  return c;
}
export async function getPolicy(db,companyId){
  const p=await db.zeroTrustPolicy.findUnique({where:{companyId}});
  if(!p)return {...DEFAULT_POLICY};
  if(p.config){const {automaticContainmentMinConfidence:_retiredConfidence,...storedConfig}=p.config;const config=validatePolicy(storedConfig);if(config.autoFreezeOnCritical===true&&db.auditLog?.findMany){const versions=await db.auditLog.findMany({where:{companyId,action:'POLICY_UPDATED'},orderBy:{timestamp:'desc'},take:50});let explicitlyEnabled=false;for(const version of versions){if(version.metadata?.config?.autoFreezeOnCritical!==true)continue;const actor=version.userId&&db.user?.findUnique?await db.user.findUnique({where:{id:version.userId},select:{isMainAdmin:true}}):null;if(actor?.isMainAdmin===true){explicitlyEnabled=true;break;}}if(!explicitlyEnabled)config.autoFreezeOnCritical=false;}return config;}
  // Preserve existing database settings during the additive upgrade. Older
  // policies used the same boundary for VERY_HIGH and CRITICAL; the critical
  // boundary remains authoritative and the preceding band ends below it.
  const previous=Object.fromEntries(['lowRiskMax','mediumRiskMax','highRiskMax','veryHighRiskMax','criticalThreshold','mfaThreshold','approvalThreshold','restrictionThreshold','freezeThreshold'].map(k=>[k,p[k]]));
  previous.veryHighRiskMax=Math.min(previous.veryHighRiskMax,previous.criticalThreshold-1);
  return validatePolicy({...previous,crossDeptRiskPenalty:p.crossDeptWeight,offHoursPenalty:p.offHoursWeight,untrustedDevicePenalty:p.deviceTrustWeight});
}
export async function savePolicy(db,actor,updates){if(Object.hasOwn(updates||{},'autoFreezeOnCritical')&&actor?.isMainAdmin!==true)throw new SecurityError(403,'MAIN_ADMIN_REQUIRED','Only the Main Admin can enable automatic endpoint containment.');return db.$transaction(async tx=>{
  const config=validatePolicy(updates,await getPolicy(tx,actor.companyId));
  const fields=Object.fromEntries(['lowRiskMax','mediumRiskMax','highRiskMax','veryHighRiskMax','criticalThreshold','mfaThreshold','approvalThreshold','restrictionThreshold','freezeThreshold'].map(k=>[k,config[k]]));
  await tx.zeroTrustPolicy.upsert({where:{companyId:actor.companyId},create:{companyId:actor.companyId,config,...fields},update:{config,...fields}});
  await audit(tx,actor,'POLICY_UPDATED',{updatedFields:Object.keys(updates),config});return{config};
});}
export function riskLevel(score,c=DEFAULT_POLICY){return score>=c.criticalThreshold?'CRITICAL':score>c.highRiskMax?'VERY_HIGH':score>c.mediumRiskMax?'HIGH':score>c.lowRiskMax?'MEDIUM':'LOW';}
export function policyAction(score,c=DEFAULT_POLICY){return score>=c.freezeThreshold&&c.autoFreezeOnCritical?'FREEZE':score>=c.restrictionThreshold?'RESTRICT':score>=c.approvalThreshold?'REQUIRE_APPROVAL':score>=c.mfaThreshold?'MFA':score>c.lowRiskMax?'MONITOR':'ALLOW';}
