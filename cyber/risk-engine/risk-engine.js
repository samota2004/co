import {db} from '../../server/models/db.js';
import {DEFAULT_POLICY,riskLevel,policyAction} from '../../server/services/policy-service.js';
import {localHour} from '../../server/services/time-context.js';
const number=(...values)=>values.find(v=>typeof v==='number'&&Number.isFinite(v));
export class RiskEngine {
  evaluateRisk(user,event={},device,resource,mlResult,policy){
    const c={...DEFAULT_POLICY,...(policy||db.policyConfig)},factors=[];
    const add=(factor,scoreImpact,description,category)=>{if(scoreImpact>0)factors.push({factor,scoreImpact:Math.round(scoreImpact*100)/100,description,category});};
    const time=new Date(event.timestamp||Date.now());
    const hour=localHour(time);
    const baseline=user.baseline?.statistics?user.baseline:null;
    const start=baseline?.normalStartHour??9,end=baseline?.normalEndHour??18;
    const isOffHours=event.isOffHours??event.metadata?.isOffHours??(!event.aggregateOnly&&(hour<start||hour>=end));
    if(isOffHours)add('Outside normal access hours',c.offHoursPenalty,'Observed access outside '+start+':00–'+end+':00 ('+(baseline?'learned baseline':'configured cold-start hours')+').','TIME');
    const userDepartment=user.departmentCode||user.department,resourceDepartment=resource?.departmentCode||resource?.department||event.resourceDepartment;
    const isCrossDepartment=Boolean(resourceDepartment&&resourceDepartment!=='ALL'&&resourceDepartment!==userDepartment);
    if(isCrossDepartment&&!event.approvalExists)add('Cross-department resource access',c.crossDeptRiskPenalty,'Requested '+(resource?.name||'resource')+' belongs to '+resourceDepartment+'; employee department is '+userDepartment+'.','RESOURCE');
    const trust=number(device?.trustScore,event.deviceTrustScore);
    // Missing device coverage is not a suspicious device observation.
    const isUnknownDevice=event.isUnknownDevice===true||device?.isTrusted===false||['REVOKED','SUSPICIOUS','UNTRUSTED'].includes(device?.status);
    if(isUnknownDevice||trust!==undefined&&trust<60)add('Unverified device posture',c.untrustedDevicePenalty*(trust===undefined?1:Math.max(.3,1-trust/100)),trust===undefined?'No verified registered device for this activity.':'Observed device trust is '+trust+'/100.','DEVICE');
    const volume=number(event.downloadVolumeMB,event.downloadSizeMB,event.metadata?.downloadSizeMB,event.metadata?.downloadMB)??0;
    const threshold=baseline?Math.max(1,baseline.maxNormalDownloadMB):c.largeDownloadThresholdMB;
    if(volume>threshold)add('Abnormal download volume',Math.min(40,15+15*Math.log2(volume/Math.max(1,threshold))),volume+' MB observed in this UTC day exceeds '+threshold+' MB '+(baseline?'historical daily':'configured daily')+' normal limit.','VOLUME');
    const failures=number(event.failedAuthCount,event.failedAttempts,event.metadata?.failedLoginAttempts)??0;
    if(failures>0)add('Repeated authentication failures',Math.min(25,5*failures),failures+' observed failed authentication attempts.','AUTH');
    if(event.isPrivilegeEscalation||event.metadata?.escalationAttempt||['PRIVILEGE_CHANGE','PRIVILEGE_ELEVATION'].includes(event.eventType))add('Privilege change',20,'A privilege-change observation was submitted.','PRIVILEGE');
    if(event.isUsbTransfer||event.metadata?.usbTransfer)add('Data transfer over removable media',12,'An explicit transfer event was observed; USB connection alone is not a transfer.','TRANSFER');
    const location=event.location;
    if(baseline&&location&&baseline.typicalLocations.length&&!baseline.typicalLocations.includes(location))add('Location outside learned baseline',10,'Observed location is absent from historical activity.','LOCATION');
    if(user.previousIncidents>0&&factors.length)add('Prior unresolved security incidents',Math.min(10,2*user.previousIncidents),user.previousIncidents+' unresolved incidents require additional review.','HISTORY');
    // The deployed RF output has no independently verified probability calibration.
    // Map its recorded operating threshold to the first alert band. This is a
    // policy mapping of model evidence, never a claim of posterior probability.
    const rawModelScore=mlResult?.threat_probability;
    const modelScore=typeof rawModelScore==='number'&&Number.isFinite(rawModelScore)&&rawModelScore>=0&&rawModelScore<=1?rawModelScore:undefined;
    const operatingThreshold=mlResult?.operating_threshold;
    const validThreshold=typeof operatingThreshold==='number'&&Number.isFinite(operatingThreshold)&&operatingThreshold>0&&operatingThreshold<1;
    const modelThreshold=validThreshold?operatingThreshold:undefined;
    const mlEvidence=modelScore===undefined||modelThreshold===undefined?null:modelScore<=modelThreshold
      ?c.mfaThreshold*modelScore/modelThreshold
      :c.mfaThreshold+(100-c.mfaThreshold)*(modelScore-modelThreshold)/(1-modelThreshold);
    const groups=new Map();
    for(const f of factors){const previous=groups.get(f.category);if(!previous||previous.scoreImpact<f.scoreImpact)groups.set(f.category,f);}
    const contextualEvidence=Math.min(100,[...groups.values()].reduce((sum,f)=>sum+f.scoreImpact,0));
    if(mlEvidence!==null)add('RF model evidence',mlEvidence,'RF score '+modelScore.toFixed(4)+' mapped using recorded threshold '+modelThreshold+'; this score is not verified as a calibrated threat probability.','ML');
    // Overlapping model and context observations must not be added twice.
    const riskScore=Math.min(100,Math.max(0,Math.round(Math.max(contextualEvidence,mlEvidence??0))));
    const action=policyAction(riskScore,c);
    return{userId:user.id,riskScore,riskLevel:riskLevel(riskScore,c),trustScore:user.trustScore??user.currentTrustScore??0,contributingFactors:factors,scoreMethod:'max(ML threshold-mapped evidence, sum of strongest observed factor per context category capped at 100); history hold applied separately',contextualEvidence,mlEvidence,recommendedAction:action,policyEnforced:action,mlAnomalyScore:modelScore??null,mlScoreType:'uncalibrated_random_forest_class_score',mlAvailable:mlEvidence!==null,modelEvidenceReason:mlResult&&mlEvidence===null?'Model score or operating threshold unavailable or invalid.':null,isCrossDepartment,isOffHours,isUnknownDevice,baselineAvailable:Boolean(baseline),explanationText:factors.length?factors.map(f=>f.description).join(' '):'No elevated signal was found in the available inputs; unobserved activity is not assessed.',timestamp:time.toISOString()};
  }
}
export const riskEngine=new RiskEngine();
