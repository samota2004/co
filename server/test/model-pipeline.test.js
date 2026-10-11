import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import express from 'express';
import {deviceFixture,projectRoot} from './device-fixture.js';

test('real Python model -> checked aggregate -> versioned prediction, SHAP and employee risk history',{timeout:180000},async()=>{
 const f=await deviceFixture();let python,server,mismatch,sse;
 const previous=process.env.ML_SERVICE_URL;
 try{
  python=spawn(process.env.CYBERORBIT_TEST_PYTHON||'python',['-m','uvicorn','ml.src.app:app','--host','127.0.0.1','--port','0'],{cwd:projectRoot,windowsHide:true,env:{...process.env,PYTHONUNBUFFERED:'1'},stdio:['ignore','pipe','pipe']});
  let startup='';python.stdout.on('data',b=>startup+=b);python.stderr.on('data',b=>startup+=b);
  const mlOrigin=await new Promise((resolve,reject)=>{
   const timer=setInterval(()=>{const match=startup.match(/Uvicorn running on (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearInterval(timer);clearTimeout(timeout);resolve(match[1]);}},100);
   const timeout=setTimeout(()=>{clearInterval(timer);reject(new Error('Isolated Python inference startup timed out'));},60000);
   python.once('error',e=>{clearInterval(timer);clearTimeout(timeout);reject(e);});
   python.once('exit',()=>{clearInterval(timer);clearTimeout(timeout);reject(new Error('Isolated inference service exited before readiness'));});
  });
  process.env.ML_SERVICE_URL=mlOrigin;
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  const {featureSchema,modelFingerprint}=await import('../services/ml-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const origin='http://127.0.0.1:'+server.address().port;
  const call=async(path,body)=>{const response=await fetch(origin+'/api'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+generateJwtToken(f.admin,true),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,data:await response.json()};};
  const day=new Date(Date.now()-86400000),weekday=(day.getUTCDay()+6)%7;
  // Complete, explicitly synthetic unit-test aggregate. This is not an agent
  // observation and no missing real source fields are filled for live users.
  const features=Object.fromEntries(featureSchema.feature_names.map(name=>[name,0]));features.day_of_week=weekday;features.is_weekend=Number(weekday>=5);
  const body={userId:f.employee.id,aggregationDate:day.toISOString().slice(0,10),features};
  assert.equal((await call('/ml/predict',{...body,features:{logon_count:1}})).status,400);
  assert.equal(await f.prisma.mlPrediction.count(),0);
  const result=await call('/ml/predict',body);assert.equal(result.status,200);
  assert.equal(result.data.event.type,'MODEL_ASSESSMENT');assert.equal(result.data.ml.model_fingerprint,modelFingerprint);
  assert.equal(result.data.ml.xai_reasons.length,5);
  assert.equal(result.data.decision.evaluation.isOffHours,false);assert.equal(result.data.decision.evaluation.isUnknownDevice,false);
  assert.equal(result.data.decision.evaluation.contributingFactors.some(f=>['TIME','DEVICE'].includes(f.category)),false);
  const prediction=await f.prisma.mlPrediction.findFirst({include:{modelVersion:true}});
  assert.equal(prediction.modelVersion.version,modelFingerprint);assert.deepEqual(prediction.featureVector,features);
  assert.equal(prediction.modelVersion.featureCount,21);assert.equal(await f.prisma.riskScore.count(),1);
  assert.equal((await call('/ml/predictions')).data.predictions.length,1);
  assert.equal((await call('/users/'+f.employee.id)).data.events[0].xaiReasons.length,5);
  // Explicit faulty-service fixture checks fail-closed behavior; it is not used
  // as inference or collector evidence.
  const mock=express();mock.post('/predict',(req,res)=>res.json({threat_probability:.5,model_fingerprint:'wrong-artifact'}));
  mismatch=await new Promise(r=>{const s=mock.listen(0,'127.0.0.1',()=>r(s));});process.env.ML_SERVICE_URL='http://127.0.0.1:'+mismatch.address().port;
  const rejected=await call('/ml/predict',body);assert.equal(rejected.status,503);assert.equal(rejected.data.error.code,'MODEL_VERSION_MISMATCH');
  assert.equal(await f.prisma.mlPrediction.count(),1);
 }finally{
  if(previous===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=previous;
  python?.kill();if(sse)clearInterval(sse.heartbeatInterval);
  if(server)await new Promise(r=>server.close(r));if(mismatch)await new Promise(r=>mismatch.close(r));await f.close();
 }
});
