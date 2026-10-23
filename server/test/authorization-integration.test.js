import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import express from 'express';
import bcrypt from 'bcryptjs';
import {deviceFixture} from './device-fixture.js';

test('persisted trust, incident holds and request tampering affect protected resource access',{timeout:90000},async()=>{
  const f=await deviceFixture();let server,sse;
  try{
    const {default:routes}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
    const url='http://127.0.0.1:'+server.address().port;
    const resource=await f.prisma.resource.create({data:{companyId:'A',resourceId:randomUUID(),name:'Sensitive test',departmentCode:'ENGINEERING',sensitivity:'CONFIDENTIAL',requiredRoles:['EMPLOYEE'],protectedData:{secret:'test only'}}});
    const call=async(body,token=generateJwtToken(f.admin,true))=>{
      const response=await fetch(`${url}/api/resources/${resource.id}/access`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
      return{status:response.status,data:await response.json()};
    };
    const body={userId:f.employee.id,isOffHours:false,eventId:randomUUID()};
    const normal=await call(body);
    assert.equal(normal.status,200);assert.equal(normal.data.decision.decision,'ALLOW');
    assert.equal(normal.data.user.id,f.admin.id);
    assert.equal(normal.data.resourceView.protectedData.secret,'test only');
    await f.prisma.user.update({where:{id:f.admin.id},data:{trustScore:45}});
    const low=await call({...body,eventId:randomUUID(),trustScore:100,riskScore:0,roleCode:'SYSTEM_ADMIN',approvalExists:true});
    assert.equal(low.status,200);assert.equal(low.data.decision.decision,'REQUIRE_APPROVAL');
    assert.equal(low.data.resourceView,undefined);
    assert.equal((await call({...body,eventId:randomUUID()},generateJwtToken(f.employee,false))).status,401);
    await f.prisma.incident.create({data:{incidentId:randomUUID(),userId:f.admin.id,userEmail:f.admin.email,title:'Unresolved critical fixture',severity:'CRITICAL',status:'OPEN',riskScore:95,contributingFactors:[]}});
    const held=await call({...body,eventId:randomUUID(),trustScore:100,approvalExists:true});
    assert.equal(held.data.decision.decision,'FREEZE');assert.equal(held.data.resourceView,undefined);
    assert.equal((await f.prisma.user.findUnique({where:{id:f.admin.id}})).status,'FROZEN');
    assert.ok((await f.prisma.auditLog.count({where:{userId:f.admin.id,action:'POLICY_DECISION'}}))>=3);
  }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});

test('review and three prior validated benign days permit gradual audited recovery',{timeout:90000},async()=>{
  const f=await deviceFixture();let sse;
  try{
    const {securityService}=await import('../services/security-service.js');
    sse=(await import('../services/sse.js')).sseManager;
    const resource=await f.prisma.resource.create({data:{companyId:'A',resourceId:randomUUID(),name:'Sensitive recovery test',departmentCode:'ENGINEERING',sensitivity:'CONFIDENTIAL',requiredRoles:['EMPLOYEE']}});
    await f.prisma.user.update({where:{id:f.employee.id},data:{trustScore:59,trustUpdatedAt:new Date(Date.now()-2*3600000)}});
    const incident=await f.prisma.incident.create({data:{incidentId:randomUUID(),userId:f.employee.id,userEmail:f.employee.email,title:'Reviewed fixture',severity:'MEDIUM',status:'OPEN',riskScore:60,contributingFactors:[]}});
    for(const daysAgo of [2,3,4])await f.prisma.activityEvent.create({data:{eventId:randomUUID(),userId:f.employee.id,userEmail:f.employee.email,userRole:'EMPLOYEE',type:'RESOURCE_ACCESS',timestamp:new Date(Date.now()-daysAgo*86400000),ip:'127.0.0.1',location:'HQ',riskContribution:0,metadata:{source:'application',decision:'ALLOW',validatedAccess:true}}});
    const blocked=await securityService.evaluate(f.admin,{userId:f.employee.id,resourceId:resource.id,isOffHours:false});
    assert.equal(blocked.user.trustScore,59);
    assert.equal(blocked.decision.decision,'REQUIRE_APPROVAL');
    await f.prisma.incident.update({where:{id:incident.id},data:{status:'RESOLVED',resolvedAt:new Date(Date.now()-5*86400000),resolvedBy:f.admin.id}});
    const recovered=await securityService.evaluate(f.employee,{userId:f.employee.id,resourceId:resource.id,isOffHours:false},{authenticatedResourceAccess:true});
    assert.equal(recovered.user.trustScore,60);
    assert.equal(recovered.decision.decision,'REQUIRE_APPROVAL'); // current decision used the previous persisted value
    assert.equal(recovered.decision.evaluation.recoveryEvidence.allowed,true);
    const subsequent=await securityService.evaluate(f.employee,{userId:f.employee.id,resourceId:resource.id,isOffHours:false},{authenticatedResourceAccess:true});
    assert.equal(subsequent.decision.decision,'ALLOW');
    assert.equal(subsequent.user.trustScore,60);
    assert.equal(await f.prisma.auditLog.count({where:{userId:f.employee.id,action:'TRUST_CHANGED'}}),1);
    assert.equal((await f.prisma.trustHistory.findFirst({where:{userId:f.employee.id,delta:1}})).delta,1);
  }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});

test('validated model score reaches MFA and malformed service output records nothing',{timeout:90000},async()=>{
  const f=await deviceFixture();let mock,sse;
  const prior=process.env.ML_SERVICE_URL;
  try{
    const {securityService}=await import('../services/security-service.js');
    const {featureSchema,modelFingerprint,modelMetadata}=await import('../services/ml-service.js');
    sse=(await import('../services/sse.js')).sseManager;
    let invalid=false;
    const app=express();app.use(express.json());
    app.post('/predict',(_,res)=>res.json(invalid?{threat_probability:2,operating_threshold:.85,model_fingerprint:modelFingerprint,predicted_class:1}:{threat_probability:.9,operating_threshold:modelMetadata.operating_threshold,model_fingerprint:modelFingerprint,predicted_class:1,xai_reasons:[]}));
    mock=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
    process.env.ML_SERVICE_URL='http://127.0.0.1:'+mock.address().port;
    const features=Object.fromEntries(featureSchema.feature_names.map(key=>[key,0]));
    const result=await securityService.evaluate(f.admin,{userId:f.employee.id,eventType:'MODEL_ASSESSMENT',features,isOffHours:false},{aggregateImport:true});
    assert.equal(result.decision.evaluation.riskScore,73);
    assert.equal(result.decision.decision,'MFA');
    assert.equal(result.decision.evaluation.mlAvailable,true);
    assert.equal(await f.prisma.mlPrediction.count(),1);
    invalid=true;
    await assert.rejects(()=>securityService.evaluate(f.admin,{userId:f.employee.id,eventType:'MODEL_ASSESSMENT',features,isOffHours:false},{aggregateImport:true}),error=>error.code==='INVALID_MODEL_RESPONSE');
    assert.equal(await f.prisma.mlPrediction.count(),1);
  }finally{if(prior===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=prior;if(sse)clearInterval(sse.heartbeatInterval);if(mock)await new Promise(resolve=>mock.close(resolve));await f.close();}
});

test('event and telemetry endpoints cannot submit arbitrary vectors for model inference',{timeout:90000},async()=>{
  const f=await deviceFixture();let server,sse;
  try{
    const {default:routes}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const {featureSchema}=await import('../services/ml-service.js');
    sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
    const token=generateJwtToken(f.admin,true),features=Object.fromEntries(featureSchema.feature_names.map(name=>[name,0]));
    features.day_of_week=1;
    const telemetryBefore=(await import('../services/ml-feature-aggregator.js')).featureState.size;
    for(const endpoint of ['/telemetry/ingest','/activity','/risk/evaluate']){
      const response=await fetch(`http://127.0.0.1:${server.address().port}/api${endpoint}`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({userId:f.employee.id,eventType:'MODEL_ASSESSMENT',features})});
      const body=await response.json();
      assert.equal(response.status,400,endpoint);
      assert.equal(body.error.code,endpoint==='/telemetry/ingest'?'ML_DATA_INCOMPLETE':'AGGREGATE_IMPORT_REQUIRED',endpoint);
      if(endpoint==='/telemetry/ingest'){
        assert.equal(body.error.details.status,'INSUFFICIENT_FOR_MODEL');
        assert.equal(body.error.details.featureCount,21);
        assert.equal(body.error.details.compatibleFeatureCount,0);
      }
    }
    assert.equal((await import('../services/ml-feature-aggregator.js')).featureState.size,telemetryBefore,'generic telemetry must not mutate pseudo-aggregate state');
    const analysisResponse=await fetch(`http://127.0.0.1:${server.address().port}/api/ml/employee/${f.employee.id}/analysis`,{headers:{Authorization:'Bearer '+token}});
    const analysisBody=await analysisResponse.json();
    assert.equal(analysisResponse.status,200);
    assert.equal(analysisBody.analysis.ml.available,false);
    assert.equal(analysisBody.analysis.ml.dataReadiness.featureCount,21);
    assert.equal(analysisBody.analysis.ml.dataReadiness.status,'INSUFFICIENT_FOR_MODEL');
    assert.equal(await f.prisma.mlPrediction.count(),0);
  }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});

test('ML client requires the guarded user-day aggregate provenance flag',async()=>{
  const {featureSchema,predictWithMLService}=await import('../services/ml-service.js');
  const features=Object.fromEntries(featureSchema.feature_names.map(name=>[name,0]));
  features.day_of_week=1;
  await assert.rejects(()=>predictWithMLService('synthetic-unit-user',features),error=>error.code==='AGGREGATE_IMPORT_REQUIRED');
});

test('an unavailable ML service fails closed without recording a normal prediction',{timeout:90000},async()=>{
  const f=await deviceFixture();let listener,sse;
  const prior=process.env.ML_SERVICE_URL;
  try{
    const {securityService}=await import('../services/security-service.js');
    const {featureSchema}=await import('../services/ml-service.js');
    sse=(await import('../services/sse.js')).sseManager;
    listener=await new Promise(resolve=>{const handle=createServer();handle.listen(0,'127.0.0.1',()=>resolve(handle));});
    const deadOrigin='http://127.0.0.1:'+listener.address().port;
    await new Promise(resolve=>listener.close(resolve));listener=null;
    process.env.ML_SERVICE_URL=deadOrigin;
    const features=Object.fromEntries(featureSchema.feature_names.map(name=>[name,0]));
    features.day_of_week=1;
    await assert.rejects(()=>securityService.evaluate(f.admin,{userId:f.employee.id,eventType:'MODEL_ASSESSMENT',features},{aggregateImport:true}),error=>error.code==='ML_SERVICE_UNAVAILABLE');
    assert.equal(await f.prisma.mlPrediction.count(),0);
    assert.equal(await f.prisma.activityEvent.count(),0);
  }finally{if(prior===undefined)delete process.env.ML_SERVICE_URL;else process.env.ML_SERVICE_URL=prior;if(sse)clearInterval(sse.heartbeatInterval);if(listener)await new Promise(resolve=>listener.close(resolve));await f.close();}
});

test('backdated, duplicate and concurrent observations cannot inflate trust recovery',{timeout:90000},async()=>{
  const f=await deviceFixture();let sse;
  try{
    const {securityService}=await import('../services/security-service.js');
    sse=(await import('../services/sse.js')).sseManager;
    const resource=await f.prisma.resource.create({data:{companyId:'A',resourceId:randomUUID(),name:'Recovery concurrency fixture',departmentCode:'ENGINEERING',sensitivity:'INTERNAL',requiredRoles:['EMPLOYEE']}});
    await f.prisma.user.update({where:{id:f.employee.id},data:{trustScore:59,trustUpdatedAt:new Date(Date.now()-2*3600000)}});
    for(const daysAgo of [2,3,4])await f.prisma.activityEvent.create({data:{eventId:randomUUID(),userId:f.employee.id,userEmail:f.employee.email,userRole:'EMPLOYEE',type:'RESOURCE_ACCESS',timestamp:new Date(Date.now()-daysAgo*86400000),ip:'127.0.0.1',location:'HQ',riskContribution:0,metadata:{source:'application',decision:'ALLOW',validatedAccess:true}}});
    const old=await securityService.evaluate(f.employee,{resourceId:resource.id,eventId:randomUUID(),timestamp:new Date(Date.now()-86400000).toISOString(),isOffHours:false},{authenticatedResourceAccess:true});
    assert.equal(old.user.trustScore,59);
    const eventId=randomUUID();
    const fresh=await securityService.evaluate(f.employee,{resourceId:resource.id,eventId,isOffHours:false},{authenticatedResourceAccess:true});
    assert.equal(fresh.user.trustScore,60);
    const duplicate=await securityService.evaluate(f.employee,{resourceId:resource.id,eventId,isOffHours:false},{authenticatedResourceAccess:true});
    assert.equal(duplicate.duplicate,true);
    const concurrent=await Promise.all([1,2].map(()=>securityService.evaluate(f.employee,{resourceId:resource.id,eventId:randomUUID(),isOffHours:false},{authenticatedResourceAccess:true})));
    assert.ok(concurrent.every(result=>result.user.trustScore===60));
    assert.equal((await f.prisma.user.findUnique({where:{id:f.employee.id}})).trustScore,60);
    assert.equal(await f.prisma.auditLog.count({where:{userId:f.employee.id,action:'TRUST_CHANGED'}}),1);
  }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});

test('real local admin MFA session guards protected data, expiry and logout',{timeout:90000},async()=>{
  const f=await deviceFixture();let server,sse;
  const prior=process.env.DEV_MFA_MODE;process.env.DEV_MFA_MODE='true';
  try{
    const password='Isolated-protected-access-fixture-123';
    await f.prisma.user.update({where:{id:f.admin.id},data:{passwordHash:await bcrypt.hash(password,10)}});
    const {default:routes}=await import('../routes/index.js');
    sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
    const base='http://127.0.0.1:'+server.address().port+'/api';
    const resource=await f.prisma.resource.create({data:{companyId:'A',resourceId:randomUUID(),name:'Session protected fixture',departmentCode:'ENGINEERING',sensitivity:'CONFIDENTIAL',requiredRoles:['EMPLOYEE'],protectedData:{secret:'session fixture'}}});
    const send=async(path,body={},headers={})=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
    assert.equal((await send('/resources/'+resource.id+'/access')).status,401);
    const login=await send('/auth/login',{email:f.admin.email,password});
    assert.equal(login.status,200);assert.equal(login.data.requiresMfa,true);
    const verified=await send('/auth/mfa/verify',{challengeId:login.data.challengeId,otp:login.data.developmentOtp});
    assert.equal(verified.status,200);assert.ok(verified.data.sessionId);
    const headers={Authorization:'Bearer '+verified.data.token};
    const catalog=await fetch(base+'/resources/'+resource.id,{headers});
    assert.equal(catalog.status,200);assert.equal((await catalog.json()).resource.protectedData,undefined);
    const granted=await send('/resources/'+resource.id+'/access',{userId:f.employee.id,roleCode:'EMPLOYEE',trustScore:100,riskScore:0,approvalExists:true},headers);
    assert.equal(granted.status,200);assert.equal(granted.data.user.id,f.admin.id);
    assert.equal(granted.data.resourceView?.protectedData?.secret,'session fixture');
    await f.prisma.session.update({where:{id:verified.data.sessionId},data:{expiresAt:new Date(Date.now()-1000)}});
    assert.equal((await send('/resources/'+resource.id+'/access',{},headers)).status,401);
    const second=await send('/auth/login',{email:f.admin.email,password});
    const renewed=await send('/auth/mfa/verify',{challengeId:second.data.challengeId,otp:second.data.developmentOtp});
    assert.equal(renewed.status,200);
    const fresh={Authorization:'Bearer '+renewed.data.token};
    assert.equal((await send('/auth/logout',{}, {...fresh,'x-cyberorbit-csrf':'1'})).status,200);
    assert.equal((await send('/resources/'+resource.id+'/access',{},fresh)).status,401);
  }finally{if(prior===undefined)delete process.env.DEV_MFA_MODE;else process.env.DEV_MFA_MODE=prior;
    if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});
