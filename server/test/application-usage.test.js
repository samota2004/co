import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {DEFAULT_CONFIG} from '../../agent/shared/contract.js';
import {EndpointService} from '../services/endpoint-service.js';

test('usage filtering precedes timeline limit and preserves employee/company isolation',{skip:!process.env.DATABASE_URL,timeout:60000},async()=>{
  const f=await deviceFixture();let server,sse;
  try{
    const {default:endpoint}=await import('../routes/endpoint.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api/endpoint',endpoint);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const origin=`http://127.0.0.1:${server.address().port}`;
    const service=new EndpointService(f.prisma);
    const call=async(user,query='')=>{
      const r=await fetch(`${origin}/api/endpoint/dashboard${query}`,{headers:{Authorization:`Bearer ${generateJwtToken(user,true)}`}});
      return {status:r.status,data:await r.json()};
    };
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Usage regression fixture',platform:'win32',config:DEFAULT_CONFIG}});
    const row=(type,name,seconds,userId=f.employee.id,companyId='A')=>({version:1,eventId:randomUUID(),deviceId:device.id,companyId,userId,type,occurredAt:new Date(Date.now()-seconds*1000),metadata:{name,pid:42,sessionId:'1',...(type==='APPLICATION_USAGE'?{durationSeconds:10}:{})}});
    // Explicit database fixtures, never sent to a real device/agent or claimed
    // as collector evidence. Newer process noise reproduces the lost-usage bug.
    await f.prisma.endpointEvent.createMany({data:[row('APPLICATION_USAGE','Notepad',800),row('APPLICATION_USAGE','brave',700),
      ...Array.from({length:220},(_,i)=>row('PROCESS_RUNNING','fixture-process',i)),
      row('APPLICATION_USAGE','other-employee',5,f.employee2.id),row('APPLICATION_USAGE','other-company',4,f.foreign.id,'B')]});
    // Console login is administrator-only. Personal filtering remains a service
    // invariant; do not fabricate employee console access to exercise it.
    assert.equal((await call(f.employee)).status,401);
    const mixed=await service.dashboard(f.employee);assert.equal(mixed.events.length,150);
    assert.ok(mixed.events.every(e=>e.type==='PROCESS_RUNNING'));assert.equal(mixed.timeline.hasMore,true);
    const own=await service.dashboard(f.employee,undefined,'APPLICATION_USAGE');
    assert.deepEqual(own.events.map(e=>e.metadata.name),['brave','Notepad']);assert.equal(own.timeline.hasMore,false);
    assert.equal(own.devices[0].user.riskScore,null,'registration risk default is not shown as assessed');
    assert.equal(own.devices[0].user.trustScore,null,'registration trust default is not shown as assessed');
    assert.equal(own.devices[0].user.assessmentStatus,'NOT_ASSESSED');
    const trustUpdatedAt=new Date();
    await f.prisma.user.update({where:{id:f.employee.id},data:{riskScore:31,riskLevel:'LOW',trustScore:76,trustUpdatedAt}});
    await f.prisma.riskScore.create({data:{userId:f.employee.id,score:31,level:'LOW',factors:[{factor:'Synthetic verified assessment'}]}});
    const assessed=await service.dashboard(f.admin,f.employee.id,'APPLICATION_USAGE');
    assert.equal(assessed.devices[0].user.riskScore,31);
    assert.equal(assessed.devices[0].user.trustScore,76);
    assert.equal(assessed.devices[0].user.assessmentStatus,'ASSESSED');
    assert.equal(own.timeline.eventType,'APPLICATION_USAGE');
    const admin=await call(f.admin,`?eventType=APPLICATION_USAGE&userId=${f.employee.id}`);
    assert.equal(admin.status,200);assert.ok(admin.data.events.some(e=>e.metadata.name==='Notepad'));
    assert.ok(admin.data.events.every(e=>e.companyId==='A'));
    assert.equal(admin.data.ml.available,false);
    assert.equal(admin.data.ml.dataReadiness.status,'INSUFFICIENT_FOR_MODEL');
    assert.equal(admin.data.ml.dataReadiness.featureCount,21);
    assert.equal(admin.data.ml.dataReadiness.compatibleFeatureCount,0);
    assert.equal(admin.data.ml.dataReadiness.version,'cyberorbit-live-rf-readiness/v1');
    assert.equal(admin.data.ml.dataReadiness.window.timezone,'UTC');
    assert.equal(admin.data.ml.dataReadiness.scopes.length,1);
    assert.equal(admin.data.ml.dataReadiness.scopes[0].deviceId,device.id);
    assert.equal(admin.data.ml.dataReadiness.scopes[0].totalEventCount,223);
    assert.equal(admin.data.ml.dataReadiness.scopes[0].attributedEventCount,222);
    assert.equal(admin.data.ml.dataReadiness.scopes[0].unattributedEventCount,1);
    assert.equal(admin.data.ml.dataReadiness.scopes[0].inferenceAllowed,false);
    assert.ok(!JSON.stringify(admin.data.ml.dataReadiness).includes('fixture-process'));
    assert.ok(admin.data.ml.dataReadiness.features.some(feature=>feature.name==='email_size_total'&&feature.status==='MISSING_COMPATIBLE_SOURCE'));
    const foreign=await call(f.otherAdmin,'?eventType=APPLICATION_USAGE');assert.ok(foreign.data.events.every(e=>e.companyId==='B'));
    assert.ok(foreign.data.ml.dataReadiness.scopes.every(scope=>scope.deviceId!==device.id));
    assert.equal((await call(f.otherAdmin,`?deviceId=${device.id}`)).status,404);
    await assert.rejects(service.dashboard(f.employee2,f.employee.id,'APPLICATION_USAGE'),{status:403});
    assert.equal((await call(f.admin,'?eventType=PROCESS_RUNNING')).status,400);
    assert.equal((await call(f.admin,'?eventType=APPLICATION_USAGE&eventType=APPLICATION_USAGE')).status,400);
    assert.equal((await call(f.admin,'?readinessDate=not-a-date')).status,400);
    assert.equal((await call(f.admin,'?readinessDate=2999-01-01')).status,400);
    await f.prisma.endpointEvent.createMany({data:Array.from({length:160},(_,i)=>row('APPLICATION_USAGE','fixture-app',i))});
    const limited=await service.dashboard(f.employee,undefined,'APPLICATION_USAGE');assert.equal(limited.events.length,150);
    assert.equal(limited.timeline.hasMore,true);
    assert.equal(await f.prisma.mlPrediction.count(),0,'endpoint observation fixtures must not trigger RF inference');
  }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(r=>server.close(r));await f.close();}
});
