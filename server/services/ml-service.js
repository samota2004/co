import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {modelDirectory} from './project-paths.js';
import {SecurityError} from './security-common.js';
export const featureSchema=JSON.parse(readFileSync(path.join(modelDirectory,'multi_source_feature_schema.json'),'utf8'));
export const modelMetadata=JSON.parse(readFileSync(path.join(modelDirectory,'multi_source_model_metadata.json'),'utf8'));
if(!Array.isArray(featureSchema.feature_names)||featureSchema.feature_names.length===0||new Set(featureSchema.feature_names).size!==featureSchema.feature_names.length||featureSchema.feature_count!==featureSchema.feature_names.length||modelMetadata.feature_count!==featureSchema.feature_names.length||!Number.isFinite(modelMetadata.operating_threshold)||modelMetadata.operating_threshold<=0||modelMetadata.operating_threshold>=1)throw new Error('Configured model feature schema or metadata is invalid.');
export const modelFingerprint=createHash('sha256').update(readFileSync(path.join(modelDirectory,'multi_source_ueba_rf.joblib'))).update(readFileSync(path.join(modelDirectory,'multi_source_feature_schema.json'))).update(readFileSync(path.join(modelDirectory,'multi_source_model_metadata.json'))).digest('hex');
export const featureSchemaFingerprint=createHash('sha256').update(readFileSync(path.join(modelDirectory,'multi_source_feature_schema.json'))).digest('hex');
export async function registerModel(db){
 const m=modelMetadata.test_metrics;
 const metadata={...modelMetadata,artifactSha256:modelFingerprint,validationStatus:modelMetadata.synthetic?'SYNTHETIC_DEVELOPMENT_ONLY':'REPORTED_NOT_INDEPENDENTLY_REPRODUCED'};
 return db.modelVersion.upsert({where:{id:'rf-'+modelFingerprint},create:{id:'rf-'+modelFingerprint,modelName:modelMetadata.model_name,version:modelFingerprint,rocAuc:m.ROC_AUC,precision:m.Precision,recall:m.Recall,f1Score:m.F1,trainingDataset:modelMetadata.dataset,featureCount:featureSchema.feature_names.length,metadata},update:{metadata}});
}
export function validateFeatures(features){
 const names=featureSchema.feature_names;
 if(!features||typeof features!=='object'||Array.isArray(features))throw new SecurityError(400,'INVALID_FEATURES','Supply the complete approved user-day aggregate feature object.');
 const missing=names.filter(k=>!(k in features)),extra=Object.keys(features).filter(k=>!names.includes(k));
 if(missing.length)throw new SecurityError(400,'ML_DATA_INCOMPLETE','The user-day aggregate is missing required model features.',{status:'INCOMPLETE',missingFeatures:missing,unknownFeatures:extra,requiredFeatureCount:names.length,remediation:'Provide every required feature from a reviewed, notebook-compatible source. Do not zero-fill unavailable telemetry.'});
 if(extra.length)throw new SecurityError(400,'FEATURE_SCHEMA_MISMATCH','Unknown feature fields were supplied.',{status:'SCHEMA_MISMATCH',unknownFeatures:extra,requiredFeatureCount:names.length,remediation:'Remove fields outside the saved model feature schema.'});
 for(const k of names)if(typeof features[k]!=='number'||!Number.isFinite(features[k])||features[k]<0)throw new SecurityError(400,'INVALID_FEATURE_VALUE',k+' must be a finite nonnegative number.');
 if(features.day_of_week>6||!Number.isInteger(features.day_of_week)||![0,1].includes(features.is_weekend))throw new SecurityError(400,'INVALID_FEATURE_VALUE','Invalid day_of_week or is_weekend.');
 const counts=['logon_count','device_event_count','file_event_count','http_event_count','email_event_count','logon_unique_pc_count','device_unique_pc_count','file_unique_pc_count','http_unique_pc_count','email_unique_pc_count','unique_files','file_content_events','unique_urls','unique_http_content','unique_recipients','total_activity','cross_source_activity'];
 for(const name of counts)if(!Number.isSafeInteger(features[name]))throw new SecurityError(400,'INVALID_FEATURE_VALUE',name+' must be a nonnegative safe integer.');
 const sourceCounts=[features.logon_count,features.device_event_count,features.file_event_count,features.http_event_count,features.email_event_count];
 if(features.is_weekend!==Number(features.day_of_week>=5))throw new SecurityError(400,'INVALID_FEATURE_VALUE','is_weekend must match the Monday-zero day_of_week value.');
 if(features.total_activity!==sourceCounts.reduce((sum,value)=>sum+value,0))throw new SecurityError(400,'INVALID_FEATURE_VALUE','total_activity must equal the five source event counts.');
 if(features.cross_source_activity!==sourceCounts.filter(value=>value>0).length)throw new SecurityError(400,'INVALID_FEATURE_VALUE','cross_source_activity must equal the number of nonempty source families.');
 const bounded=[['logon_unique_pc_count',features.logon_count],['device_unique_pc_count',features.device_event_count],['file_unique_pc_count',features.file_event_count],['http_unique_pc_count',features.http_event_count],['email_unique_pc_count',features.email_event_count],['unique_files',features.file_event_count],['file_content_events',features.file_event_count],['unique_urls',features.http_event_count],['unique_http_content',features.http_event_count],['unique_recipients',features.email_event_count]];
 for(const [name,maximum] of bounded)if(features[name]>maximum)throw new SecurityError(400,'INVALID_FEATURE_VALUE',name+' cannot exceed its source event count.');
 return Object.fromEntries(names.map(k=>[k,features[k]]));
}
async function call(path,body){
 try{
 const response=await fetch((process.env.ML_SERVICE_URL||'http://127.0.0.1:8000')+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();
 if(!response.ok)throw new SecurityError(response.status===400||response.status===422?400:503,'ML_SERVICE_ERROR',response.status<500?'Model rejected the supplied feature schema.':'ML inference is unavailable.');
 return data;
 }catch(e){if(e instanceof SecurityError)throw e;throw new SecurityError(503,'ML_SERVICE_UNAVAILABLE','Cannot reach the ML service. No ML assessment was recorded.');}
}
export async function predictWithMLService(user,features,{aggregateImport=false}={}){
 if(aggregateImport!==true)throw new SecurityError(400,'AGGREGATE_IMPORT_REQUIRED','RF inference accepts only a guarded, complete user-day aggregate. Single application events cannot be expanded into the training vector.');
 const result=await call('/predict',{user,features:validateFeatures(features)});
 // Legacy wire field name: this is the RF positive-class score, not a
 // scientifically calibrated threat probability.
 if(!Number.isFinite(result.threat_probability)||result.threat_probability<0||result.threat_probability>1)throw new SecurityError(503,'INVALID_MODEL_RESPONSE','ML service returned an invalid model score.');
 if(result.model_fingerprint!==modelFingerprint)throw new SecurityError(503,'MODEL_VERSION_MISMATCH','Node and Python must use the same model, feature schema and report. Restart both with matching artifact configuration.');
 if(result.model_version!==modelFingerprint||result.model_name!==modelMetadata.model_name||result.feature_schema_fingerprint!==featureSchemaFingerprint||result.feature_count!==featureSchema.feature_count||result.aggregation_level!==modelMetadata.aggregation_level||result.provenance!=='complete externally supplied user-day aggregate; not derived from live endpoint events')throw new SecurityError(503,'MODEL_PROVENANCE_MISMATCH','ML service did not return the configured model and feature-schema provenance.');
 if(!Number.isFinite(result.operating_threshold)||result.operating_threshold<=0||result.operating_threshold>=1||Math.abs(result.operating_threshold-modelMetadata.operating_threshold)>1e-12||![0,1].includes(result.predicted_class)||(result.predicted_class!==Number(result.threat_probability>=result.operating_threshold)&&Math.abs(result.threat_probability-result.operating_threshold)>5e-7))throw new SecurityError(503,'INVALID_MODEL_RESPONSE','ML service returned an inconsistent model score or threshold.');
 return{...result,available:true,model_name:modelMetadata.model_name,model_version:modelFingerprint,feature_schema_fingerprint:featureSchemaFingerprint,feature_count:featureSchema.feature_count,aggregation_level:modelMetadata.aggregation_level,provenance:'complete externally supplied user-day aggregate; not derived from live endpoint events'};
}
export async function checkMLServiceHealth(){
 const health=await call('/health');
 if(health.status!=='ok'||health.model_fingerprint!==modelFingerprint||health.feature_schema_fingerprint!==featureSchemaFingerprint||health.aggregation_level!==modelMetadata.aggregation_level||health.feature_count!==featureSchema.feature_names.length||!Number.isFinite(health.operating_threshold)||Math.abs(health.operating_threshold-modelMetadata.operating_threshold)>1e-12)throw new SecurityError(503,'MODEL_VERSION_MISMATCH','The ML service is not serving the configured model, schema, and threshold.');
 return health;
}
