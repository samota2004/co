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
  const beforeRisk=await f.prisma.riskScore.count({where:{userId:f.employee.id}}),beforeTrust=await f.prisma.trustHistory.count({where:{userId:f.employee.id}}),beforeIncidents=await f.prisma.incident.count({where:{userId:f.employee.id}});
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
  assert.equal(result.data.simulationOnly,true);
  assert.equal(result.data.userState.productionStateUnchanged,true);
  assert.equal(result.data.decision.evaluation.riskScore,0);
  assert.equal(result.data.ml.available,false,'custom simulator never invokes the RF model');
  assert.equal(await f.prisma.activityEvent.count({where:{userId:f.employee.id}}),before,'synthetic simulation does not enter employee activity history');
  assert.equal(await f.prisma.riskScore.count({where:{userId:f.employee.id}}),beforeRisk,'synthetic simulation does not change production risk history');
  assert.equal(await f.prisma.trustHistory.count({where:{userId:f.employee.id}}),beforeTrust,'synthetic simulation does not change production trust history');
  assert.equal(await f.prisma.incident.count({where:{userId:f.employee.id}}),beforeIncidents,'synthetic simulation never creates production incidents');
  assert.equal(await f.prisma.auditLog.count({where:{userId:f.admin.id,action:'SIMULATION_RUN'}}),1,'synthetic run is retained in the administrator audit history');
  assert.equal(await f.prisma.mlPrediction.count(),0);

  const predefined=await call('/api/simulation/scenario/scenario-1-normal',{userId:f.employee2.id});
  assert.equal(predefined.status,200);
  assert.equal(predefined.data.simulationOnly,true,'predefined scenarios are read-only too');
  assert.equal(await f.prisma.auditLog.count({where:{userId:f.admin.id,action:'SIMULATION_RUN'}}),2);
  const history=await fetch(origin+'/api/simulation/history',{headers:{Authorization:`Bearer ${adminToken}`}}).then(r=>r.json());
  assert.equal(history.runs.length,2);
  assert.ok(history.runs.every(row=>row.synthetic&&row.simulationOnly));
 }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});
