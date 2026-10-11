import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {deviceFixture,projectRoot} from './device-fixture.js';

test('posture, authenticated resource access, manager telemetry, exports and SSE stay scoped',{timeout:90000},async()=>{
 const f=await deviceFixture();let server,sse;
 try{
  await f.prisma.role.create({data:{code:'MANAGER',name:'Manager'}});
  const manager=await f.prisma.user.create({data:{employeeId:randomUUID(),email:randomUUID()+'@test.invalid',companyId:'A',name:'Scoped manager',roleCode:'MANAGER'}});
  await f.prisma.user.update({where:{id:f.employee.id},data:{managerId:manager.id}});
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  const {getPolicy}=await import('../services/policy-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json({limit:'256kb'}));app.use('/api',routes);
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  const origin='http://127.0.0.1:'+server.address().port;
  const call=async(user,path,method='GET',body)=>{
   const response=await fetch(origin+'/api'+path,{method,headers:{Authorization:'Bearer '+generateJwtToken(user,true),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   return{status:response.status,data:response.headers.get('content-type')?.includes('json')?await response.json():await response.text()};
  };
  const resource=(await call(f.admin,'/resources','POST',{name:'Approved project',department:'ENGINEERING',sensitivity:'INTERNAL',requiredRoles:['EMPLOYEE'],protectedData:{text:'Isolated confidential fixture'}})).data.resource;
  assert.equal((await call(f.employee,'/resources')).data.resources[0].protectedData,undefined);
  assert.equal((await call(f.employee,'/resources/'+resource.id)).data.resource.protectedData,undefined);
  const d=(await call(f.admin,'/devices','POST',{userId:f.employee.id,name:'Logical device'})).data.device;
  assert.equal((await call(f.employee,'/devices/'+d.id,'PATCH',{status:'TRUSTED',trustScore:80})).status,403);
  assert.equal((await call(f.otherAdmin,'/devices/'+d.id,'PATCH',{status:'TRUSTED',trustScore:80})).status,404);
  assert.equal((await call(f.admin,'/devices/'+d.id,'PATCH',{status:'TRUSTED',trustScore:80})).status,200);
  assert.equal((await call(f.employee,'/devices/'+d.id)).data.device.fingerprint,undefined);
  // Employees cannot inject another identity, trust or off-hours context.
  const access=await call(f.employee,'/resources/'+resource.id+'/access','POST',{userId:f.foreign.id,deviceId:d.id,isOffHours:false,deviceTrustScore:100});
  assert.equal(access.status,200);assert.equal(access.data.user.id,f.employee.id);
  assert.equal(access.data.resourceView.protectedData.text,'Isolated confidential fixture');
  assert.equal((await call(f.admin,'/resources/'+resource.id,'PATCH',{protectedData:null})).status,200);
  assert.equal((await f.prisma.resource.findUnique({where:{id:resource.id}})).protectedData,null);
  assert.equal(access.data.decision.evaluation.isUnknownDevice,true);
  assert.equal(await f.prisma.activityEvent.count({where:{userId:f.foreign.id}}),0);
  assert.equal((await call(f.otherAdmin,'/resources/'+resource.id+'/access','POST',{userId:f.foreign.id})).status,404);
  assert.equal((await call(f.employee,'/missing-api')).status,404);
  assert.equal((await call(f.employee,'/audit-logs')).status,403);
  assert.equal((await call(f.admin,'/audit-logs?severity=INVALID')).status,400);
  const exported=await call(f.admin,'/audit-logs/export?format=json&action=DEVICE_POSTURE_UPDATED');
  assert.equal(exported.status,200);assert.ok(exported.data.length>0);assert.ok(exported.data.every(r=>r.action==='DEVICE_POSTURE_UPDATED'&&r.companyId==='A'));
  assert.equal((await call(f.admin,'/incidents/export?status=INVALID')).status,400);
  await f.prisma.zeroTrustPolicy.create({data:{companyId:'B',mfaThreshold:45,approvalThreshold:65,restrictionThreshold:80,crossDeptWeight:33}});
  const preserved=await getPolicy(f.prisma,'B');assert.equal(preserved.mfaThreshold,45);assert.equal(preserved.crossDeptRiskPenalty,33);
  const endpoint=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Report laptop',platform:'win32',config:{}}});
  await f.prisma.endpointEvent.create({data:{version:1,eventId:randomUUID(),deviceId:endpoint.id,companyId:'A',userId:f.employee.id,type:'APPLICATION_USAGE',occurredAt:new Date(),metadata:{pid:7,name:'test-only',durationSeconds:4,identity:'verified-fixture',sessionId:'1'}}});
  assert.equal((await call(manager,'/endpoint/dashboard?userId='+f.employee.id+'&eventType=APPLICATION_USAGE')).data.events.length,1);
  assert.equal((await call(manager,'/endpoint/dashboard?userId='+f.employee2.id)).status,403);
  const stream=(user=manager)=>{const r=new EventEmitter();r.headersSent=false;r.writes=[];r.writeHead=()=>{r.headersSent=true;};r.write=x=>r.writes.push(x);r.end=()=>{r.writableEnded=true;r.emit('close');};sse.addClient(r,user,Date.now()+60000);return r;};
  const employeeStream=stream(f.employee);
  sse.broadcastIncident({userId:f.employee.id,companyId:'A',resolutionNotes:'Restricted investigation fixture'},true);
  sse.broadcastAuditLog({userId:f.employee.id,companyId:'A',details:'Restricted audit fixture'});
  assert.equal(employeeStream.writes.some(x=>x.includes('Restricted')),false);
  employeeStream.end();
  const client=stream();sse.broadcastActivity({userId:f.employee.id,companyId:'A',marker:'allowed'});
  await new Promise(r=>setTimeout(r,150));assert.ok(client.writes.some(x=>x.includes('allowed')));
  sse.broadcastActivity({userId:f.foreign.id,companyId:'B',marker:'foreign-denied'});
  await f.prisma.user.update({where:{id:f.employee.id},data:{managerId:null}});
  sse.broadcastActivity({userId:f.employee.id,companyId:'A',marker:'reassignment-denied'});
  await new Promise(r=>setTimeout(r,150));assert.ok(!client.writes.some(x=>x.includes('foreign-denied')||x.includes('reassignment-denied')));client.end();
  const {SecurityService}=await import('../services/security-service.js');
  const engine=new SecurityService(f.prisma);
  const elevated=await engine.evaluate(f.admin,{userId:f.employee2.id,eventType:'FAILED_LOGIN',isOffHours:true,isUnknownDevice:true,failedAuthCount:5});
  assert.equal(elevated.decision.decision,'MFA');
  const clean=await engine.evaluate(f.admin,{userId:f.employee2.id,eventType:'RESOURCE_ACCESS',resourceId:resource.id,deviceTrustScore:100,isOffHours:false});
  assert.equal(clean.decision.decision,'MFA','Clean retry cannot bypass a recent elevated assessment');
  const stepped=await engine.evaluate(f.admin,{userId:f.employee2.id,eventType:'RESOURCE_ACCESS',resourceId:resource.id,deviceTrustScore:100,isOffHours:false},{mfaFresh:true});
  assert.equal(stepped.decision.decision,'MONITOR');
  assert.equal((await call(f.admin,'/users/'+f.employee2.id+'/unfreeze','POST',{})).status,200);
  const reviewed=await engine.evaluate(f.admin,{userId:f.employee2.id,eventType:'RESOURCE_ACCESS',resourceId:resource.id,deviceTrustScore:100,isOffHours:false});
  assert.equal(reviewed.decision.allowed,true);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(r=>server.close(r));await f.close();}
});

test('opt-in synthetic seed is idempotent and preserves existing accounts and credentials',{timeout:90000},async()=>{
 const f=await deviceFixture();
 try{
  const before=await f.prisma.user.findUnique({where:{id:f.admin.id}});
  const seed=()=>new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['prisma/seed.js','--demo'],{cwd:projectRoot,windowsHide:true,env:{...process.env,DATABASE_URL:f.url,DEMO_PASSWORD:'Isolated-synthetic-demo-password'},stdio:['ignore','pipe','pipe']});
   let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Synthetic seed failed: '+output)));
  });
  await seed();const count=await f.prisma.activityEvent.count();await seed();
  assert.equal(await f.prisma.activityEvent.count(),count);assert.equal(count,2100);
  assert.equal(await f.prisma.user.count({where:{companyId:'cyberorbit-demo',roleCode:'EMPLOYEE'}}),100);
  assert.equal(await f.prisma.user.count({where:{companyId:'cyberorbit-demo',roleCode:'MANAGER'}}),10);
  assert.deepEqual(await f.prisma.user.findUnique({where:{id:f.admin.id}}),before);
  assert.ok((await f.prisma.activityEvent.findFirst()).metadata.synthetic);
 }finally{await f.close();}
});
