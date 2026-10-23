import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {deviceFixture} from './device-fixture.js';

test('custom simulator uses a bounded synthetic assessment route and preserves generic telemetry guard',{timeout:90000},async()=>{
 const f=await deviceFixture();let server,sse;
 try{
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);
  server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const adminToken=generateJwtToken(f.admin,true);
  const call=async(path,body,token=adminToken)=>{
   const response=await fetch(origin+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
   return{status:response.status,data:await response.json()};
  };
  const custom={userId:f.employee.id,downloadVolumeMB:20,failedAuthCount:0,isOffHours:false,isPrivilegeEscalation:false};
  const before=await f.prisma.activityEvent.count({where:{userId:f.employee.id}});
  const legacy=await call('/api/telemetry/ingest',{...custom,eventType:'FILE_DOWNLOAD',source:'synthetic-custom-scenario',metadata:{synthetic:true}});
  assert.equal(legacy.status,400);
  assert.equal(legacy.data.error.code,'ML_DATA_INCOMPLETE');
  assert.equal(await f.prisma.activityEvent.count({where:{userId:f.employee.id}}),before,'generic model telemetry remains fail-closed with no event write');

  const invalid=await call('/api/simulation/custom',{...custom,metadata:{synthetic:true}});
  assert.equal(invalid.status,400);
  assert.equal(invalid.data.error.code,'INVALID_SIMULATION_INPUT');
  const outOfRange=await call('/api/simulation/custom',{...custom,failedAuthCount:101});
  assert.equal(outOfRange.status,400);
  assert.equal(await f.prisma.activityEvent.count({where:{userId:f.employee.id}}),before,'invalid custom input has no persistence side effects');

  const outOfScope=await call('/api/simulation/custom',{...custom,userId:f.employee.id},generateJwtToken(f.otherAdmin,true));
  assert.equal(outOfScope.status,404,'authenticated administrator cannot target another company');
  assert.equal((await call('/api/simulation/custom',custom,generateJwtToken(f.employee,false))).status,401,'employee session cannot execute administrator simulator route');

  const result=await call('/api/simulation/custom',custom);
  assert.equal(result.status,200);
  assert.equal(result.data.success,true);
  assert.equal(result.data.synthetic,true);
  assert.equal(result.data.scenario,'Custom synthetic context');
  assert.equal(result.data.event.eventType,'FILE_DOWNLOAD');
  assert.equal(result.data.ml.available,false,'custom simulator never invokes the RF model');
  const stored=await f.prisma.activityEvent.findUnique({where:{eventId:result.data.event.eventId}});
  assert.equal(stored.metadata.synthetic,true);
  assert.equal(stored.metadata.simulation,true);
  assert.equal(stored.metadata.source,'synthetic-custom-scenario');
  assert.equal(await f.prisma.auditLog.count({where:{userId:f.employee.id,action:'POLICY_DECISION'}}),1);
  assert.equal(await f.prisma.mlPrediction.count(),0);

  const predefined=await call('/api/simulation/scenario/scenario-1-normal',{userId:f.employee2.id});
  assert.equal(predefined.status,200);
  const predefinedEvent=await f.prisma.activityEvent.findUnique({where:{eventId:predefined.data.event.eventId}});
  assert.equal(predefinedEvent.metadata.synthetic,true);
  assert.equal(predefinedEvent.metadata.simulation,true,'predefined and custom synthetic assessments use the same persisted simulation marker');
 }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});
