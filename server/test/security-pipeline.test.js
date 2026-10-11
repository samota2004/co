import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('durable security flow, isolation, manager scope, approvals, freeze and session rotation',{timeout:90000},async()=>{
 const f=await deviceFixture();let server,sse;
 try{
  await f.prisma.role.create({data:{code:'MANAGER',name:'Manager'}});
  const manager=await f.prisma.user.create({data:{employeeId:randomUUID(),email:randomUUID()+'@test.invalid',name:'Manager',companyId:'A',roleCode:'MANAGER'}});
  await f.prisma.user.update({where:{id:f.employee.id},data:{managerId:manager.id}});
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  const {SecurityService}=await import('../services/security-service.js');
  const {issueSession}=await import('../services/session-service.js');
  const {validateFeatures}=await import('../services/ml-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const url='http://127.0.0.1:'+server.address().port;
  const call=async(user,path,method='GET',body,extra={})=>{
   const r=await fetch(url+'/api'+path,{method,headers:{...(user?{Authorization:'Bearer '+generateJwtToken(user,true)}:{}),'Content-Type':'application/json',...extra},...(body?{body:JSON.stringify(body)}:{})});
   return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
  };
  assert.equal((await call(null,'/users')).status,401);
  assert.equal((await call(f.otherAdmin,'/users/'+f.employee.id)).status,404);
  assert.equal((await call(f.employee,'/users/'+f.employee2.id)).status,404);
  assert.equal((await call(manager,'/users/'+f.employee.id)).status,200);
  assert.equal((await call(manager,'/users/'+f.employee2.id)).status,404);
  assert.equal((await call(f.employee,'/policies','PATCH',{mfaThreshold:1})).status,403);
  assert.equal((await call(f.admin,'/policies','PATCH',{mfaThreshold:99})).status,400);
  const config=await call(f.admin,'/policies','PATCH',{adaptiveTrustRecoveryRate:2});assert.equal(config.status,200);
  assert.equal((await call(f.admin,'/policies')).data.config.adaptiveTrustRecoveryRate,2);
  assert.throws(()=>validateFeatures({logon_count:1}),/Missing features/);
  const device=await f.prisma.device.create({data:{deviceId:randomUUID(),userId:f.employee.id,name:'Known logical test device',os:'Windows',browser:'Test',ip:'127.0.0.1',location:'HQ',trustScore:95,isTrusted:true}});
  const resource=await f.prisma.resource.create({data:{resourceId:randomUUID(),companyId:'A',name:'Engineering project',departmentCode:'ENGINEERING',requiredRoles:['EMPLOYEE','MANAGER']}});
  assert.equal((await call(f.otherAdmin,'/resources/'+resource.id)).status,404);
  const engine=new SecurityService(f.prisma);
  const event={userId:f.employee.id,eventId:randomUUID(),eventType:'FILE_ACCESS',deviceId:device.id,resourceId:resource.id,isOffHours:false};
  const normal=await engine.evaluate(f.admin,event);assert.equal(normal.decision.decision,'ALLOW');assert.equal(normal.ml.available,false);
  assert.equal(normal.baseline.available,false);
  const dupe=await engine.evaluate(f.admin,event);assert.equal(dupe.duplicate,true);
  assert.equal(await f.prisma.riskScore.count({where:{sourceEventId:event.eventId}}),1);
  const request=await call(f.employee,'/access-requests','POST',{resourceId:resource.id,reason:'Team task'});assert.equal(request.status,200);
  assert.equal((await call(f.employee,'/access-requests/'+request.data.request.id+'/approve','POST',{})).status,403);
  assert.equal((await call(manager,'/access-requests/'+request.data.request.id+'/approve','POST',{notes:'Assigned team scope'})).status,200);
  assert.equal((await call(manager,'/access-requests/'+request.data.request.id+'/approve','POST',{})).status,409);
  // Refresh secrets are kept in test memory and never written to the output.
  let refreshCookie;
  const issued=await issueSession(f.employee,{ip:'127.0.0.1',headers:{},socket:{}},{cookie:(name,value)=>{refreshCookie=name+'='+value;}});
  const refreshed=await call(null,'/auth/refresh','POST',{}, {Cookie:refreshCookie,'x-cyberorbit-csrf':'1'});assert.equal(refreshed.status,200);
  assert.equal((await call(null,'/auth/refresh','POST',{}, {Cookie:refreshCookie,'x-cyberorbit-csrf':'1'})).status,401);
  assert.equal((await call(null,'/auth/refresh','POST',{}, {Cookie:refreshed.cookie.split(';')[0],Origin:'https://wrong.invalid'})).status,403);
  const critical=await engine.evaluate(f.admin,{userId:f.employee.id,eventType:'PRIVILEGE_CHANGE',isOffHours:true,isUnknownDevice:true,downloadVolumeMB:2500,failedAuthCount:5,metadata:{usbTransfer:true}});
  assert.equal(critical.decision.decision,'FREEZE');assert.equal(critical.user.status,'FROZEN');assert.equal(critical.incident.status,'OPEN');
  assert.equal(await f.prisma.session.count({where:{userId:f.employee.id,revokedAt:null}}),0);
  assert.equal((await call(f.employee,'/users/'+f.employee.id)).status,401);
  assert.equal((await call(f.admin,'/users/'+f.employee.id+'/unfreeze','POST',{})).status,200);
  const oldTokenResponse=await fetch(url+'/api/users/'+f.employee.id,{headers:{Authorization:'Bearer '+issued.token}});assert.equal(oldTokenResponse.status,401);
  assert.equal(await f.prisma.activityEvent.count({where:{userId:f.employee.id}}),2);
  assert.equal(await f.prisma.trustHistory.count({where:{userId:f.employee.id}}),2);
  const audits=await call(f.admin,'/audit-logs');assert.equal(audits.status,200);assert.ok(audits.data.auditLogs.some(a=>a.action==='POLICY_DECISION'));
  assert.ok(audits.data.auditLogs.every(a=>a.companyId==='A'));
 }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(r=>server.close(r));await f.close();}
});

test('baseline requires observed prior days, excludes the current day and preserves zero trust',{timeout:60000},async()=>{
 const f=await deviceFixture();let sse;
 try{
  const {learnBaseline}=await import('../services/ueba-service.js');
  const {evolveTrust}=await import('../../cyber/zero-trust/trust-engine.js');
  const {DEFAULT_POLICY}=await import('../services/policy-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  assert.equal((await learnBaseline(f.prisma,f.employee.id)).available,false);
  const now=new Date();now.setUTCHours(10,0,0,0);
  await f.prisma.activityEvent.createMany({data:Array.from({length:8},(_,i)=>({eventId:randomUUID(),userId:f.employee.id,userEmail:f.employee.email,userRole:'EMPLOYEE',type:'LOGIN',timestamp:new Date(now.getTime()-i*86400000),ip:'127.0.0.1',location:'HQ',downloadSizeMB:i===0?100000:10}))});
  const b=await learnBaseline(f.prisma,f.employee.id);assert.equal(b.available,true);assert.equal(b.sampleDays,7);assert.equal(b.maxNormalDownloadMB,15);assert.equal(b.statistics.events,7);
  assert.equal(evolveTrust(0,90,DEFAULT_POLICY),0);assert.equal(evolveTrust(0,0,DEFAULT_POLICY,true),1);assert.equal(evolveTrust(0,0,DEFAULT_POLICY,false),0);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});
