import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {modelDirectory} from './project-paths.js';
import {SecurityError} from './security-common.js';
export const featureSchema=JSON.parse(readFileSync(path.join(modelDirectory,'multi_source_feature_schema.json'),'utf8'));
export const modelMetadata=JSON.parse(readFileSync(path.join(modelDirectory,'multi_source_model_metadata.json'),'utf8'));
export const modelFingerprint=createHash('sha256').update(readFileSync(path.join(modelDirectory,'multi_source_ueba_rf.joblib'))).update(readFileSync(path.join(modelDirectory,'multi_source_feature_schema.json'))).update(readFileSync(path.join(modelDirectory,'multi_source_model_metadata.json'))).digest('hex');
export async function registerModel(db){
 const m=modelMetadata.test_metrics;
 return db.modelVersion.upsert({where:{id:'rf-'+modelFingerprint},create:{id:'rf-'+modelFingerprint,modelName:modelMetadata.model_name,version:modelFingerprint,rocAuc:m.ROC_AUC,precision:m.Precision,recall:m.Recall,f1Score:m.F1,trainingDataset:modelMetadata.dataset,featureCount:featureSchema.feature_names.length,metadata:{...modelMetadata,artifactSha256:modelFingerprint}},update:{}});
}
export function validateFeatures(features){
 const names=featureSchema.feature_names;
 if(!features||typeof features!=='object'||Array.isArray(features))throw new SecurityError(400,'INVALID_FEATURES','Supply the complete approved user-day aggregate feature object.');
 const missing=names.filter(k=>!(k in features)),extra=Object.keys(features).filter(k=>!names.includes(k));
 if(missing.length||extra.length)throw new SecurityError(400,'FEATURE_SCHEMA_MISMATCH','Missing features: '+(missing.join(', ')||'none')+'. Unknown features: '+(extra.join(', ')||'none')+'.');
 for(const k of names)if(typeof features[k]!=='number'||!Number.isFinite(features[k])||features[k]<0)throw new SecurityError(400,'INVALID_FEATURE_VALUE',k+' must be a finite nonnegative number.');
 if(features.day_of_week>6||!Number.isInteger(features.day_of_week)||![0,1].includes(features.is_weekend))throw new SecurityError(400,'INVALID_FEATURE_VALUE','Invalid day_of_week or is_weekend.');
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
export async function predictWithMLService(user,features){
 const result=await call('/predict',{user,features:validateFeatures(features)});
 if(!Number.isFinite(result.threat_probability)||result.threat_probability<0||result.threat_probability>1)throw new SecurityError(503,'INVALID_MODEL_RESPONSE','ML service returned an invalid probability.');
 if(result.model_fingerprint!==modelFingerprint)throw new SecurityError(503,'MODEL_VERSION_MISMATCH','Node and Python must use the same model, feature schema and report. Restart both with matching artifact configuration.');
 return{...result,available:true};
}
export async function checkMLServiceHealth(){return call('/health');}
