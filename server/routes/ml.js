import {Router} from 'express';
import {readFile} from 'node:fs/promises';
import {prisma} from '../models/prisma.js';
import {requireSecurityAdmin} from '../middleware/auth.js';
import {api,scopedUser,SecurityError,userScope} from '../services/security-common.js';
import {featureSchema,modelMetadata,modelFingerprint,checkMLServiceHealth} from '../services/ml-service.js';
import {securityService} from '../services/security-service.js';
import {createLiveModelDataReadiness} from '../services/ml-data-readiness.js';
const router=Router();
router.get('/metrics',requireSecurityAdmin,api(async()=>{
 let experiment=null;
 if(process.env.ML_EXPERIMENT_REPORT){
  const content=await readFile(process.env.ML_EXPERIMENT_REPORT,'utf8');
  if(Buffer.byteLength(content)>5*1024*1024)throw new Error('Report exceeds limit');
  experiment=JSON.parse(content);
  if(!experiment.models?.baseline?.test_metrics||!experiment.models?.enhanced?.test_metrics||!experiment.source_sha256)throw new Error('Invalid experiment report');
 }
 return{metrics:modelMetadata,modelFingerprint,featureSchema,provenance:'Configured artifact report. Original repository CERT report was not independently retrained in this deployment.',experiment,enhancedModel:{available:Boolean(experiment),reason:experiment?(experiment.synthetic?'Configured synthetic smoke-test report; not CERT research evidence.':'Configured paired experiment report. Review dataset provenance and split limitations.'):'Run the documented paired training experiment on an authorized dataset and configure ML_EXPERIMENT_REPORT.'}};
}));
router.get('/models',requireSecurityAdmin,api(async()=>({models:[{...modelMetadata,active:true,features:featureSchema.feature_names}]})));
router.get('/health',requireSecurityAdmin,api(async()=>({...await checkMLServiceHealth()})));
router.get('/status',requireSecurityAdmin,api(async()=>({...await checkMLServiceHealth()})));
router.get('/predictions',requireSecurityAdmin,api(async req=>({predictions:await prisma.mlPrediction.findMany({where:{user:userScope(req.user)},select:{id:true,userId:true,timestamp:true,anomalyScore:true,isAnomalous:true,riskScore:true,modelVersionId:true,attributions:true},orderBy:{timestamp:'desc'},take:100})})));
router.post('/predict',requireSecurityAdmin,api(req=>{
 const date=req.body.aggregationDate;
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>=new Date().toISOString().slice(0,10))throw new SecurityError(400,'AGGREGATION_DATE_REQUIRED','Supply the YYYY-MM-DD UTC date of a complete prior user-day window.');
 const weekday=(new Date(date).getUTCDay()+6)%7;
 if(req.body.features?.day_of_week!==weekday||req.body.features?.is_weekend!==Number(weekday>=5))throw new SecurityError(400,'AGGREGATION_CALENDAR_MISMATCH','Calendar features must match the declared UTC aggregate date.');
 return securityService.evaluate(req.user,{userId:req.body.userId,features:req.body.features,eventType:'MODEL_ASSESSMENT',source:'approved-user-day-feature-import',metadata:{aggregation:'user-day',aggregationDate:date,model:modelMetadata.model_name}},{ip:req.ip,aggregateImport:true});
}));
router.get('/employee/:userId/analysis',api(async req=>{
 const user=await scopedUser(prisma,req.user,req.params.userId);
 const [events,latest,baseline]=await Promise.all([prisma.activityEvent.findMany({where:{userId:user.id},orderBy:{timestamp:'desc'},take:200}),prisma.riskScore.findFirst({where:{userId:user.id},orderBy:{timestamp:'desc'}}),prisma.behaviorProfile.findUnique({where:{userId:user.id}})]);
 const dataReadiness=createLiveModelDataReadiness();
 return{employee:{id:user.id,name:user.name,riskScore:latest?user.riskScore:null,trustScore:user.trustUpdatedAt?user.trustScore:null,riskLevel:latest?user.riskLevel:null},analysis:{hasActivity:events.length>0,latestDate:events[0]?.timestamp||null,features:null,ml:{available:false,status:'AWAITING_COMPLETE_USER_DAY',reason:'Live application and enrolled-device telemetry cannot construct the notebook-equivalent 21-feature user-day. No missing features have been filled in.',requiredFeatures:featureSchema.feature_names,dataReadiness},behavior:{totalEvents:events.length,failedLogins:events.reduce((n,e)=>n+e.failedAttempts,0),downloadVolumeMB:events.reduce((n,e)=>n+e.downloadSizeMB,0),offHoursEvents:events.filter(e=>e.isOffHours).length},risk:latest,baseline}};
}));
export default router;
