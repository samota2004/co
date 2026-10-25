import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('employee login, pending OTP, existing JWT and refresh are denied; administrator MFA still works', {timeout:60000},async()=>{
 const f=await deviceFixture();let server,sse;
 const previous=process.env.DEV_MFA_MODE;process.env.DEV_MFA_MODE='true';
 try{
  const password='Isolated-admin-only-test-password';
  await f.prisma.user.updateMany({where:{id:{in:[f.admin.id,f.employee.id]}},data:{passwordHash:await bcrypt.hash(password,10)}});
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  const {hashOtp}=await import('../services/auth-service.js');
  const {refreshHash}=await import('../services/session-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const origin='http://127.0.0.1:'+server.address().port;
  const post=async(path,body,headers={})=>{const r=await fetch(origin+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
  for(const email of [f.employee.email,f.employee.employeeId]){
   const denied=await post('/auth/login',{email,password});assert.equal(denied.status,403);assert.equal(denied.data.error.code,'ADMIN_LOGIN_REQUIRED');assert.equal(denied.data.token,undefined);
  }
  assert.equal(await f.prisma.mfaSession.count({where:{userId:f.employee.id}}),0);
  const pending=await f.prisma.mfaSession.create({data:{userId:f.employee.id,challengeHash:hashOtp('123456'),action:'LOGIN',expiresAt:new Date(Date.now()+60000)}});
  assert.equal((await post('/auth/mfa/verify',{challengeId:pending.id,otp:'123456'})).status,403);
  const oldJwt=generateJwtToken(f.employee,true);
  assert.equal((await fetch(origin+'/api/auth/me',{headers:{Authorization:'Bearer '+oldJwt}})).status,401);
  const secret='A'.repeat(43);
  await f.prisma.session.create({data:{userId:f.employee.id,sessionToken:randomUUID(),refreshHash:refreshHash(secret),ip:'127.0.0.1',expiresAt:new Date(Date.now()+60000)}});
  assert.equal((await post('/auth/refresh',{}, {Cookie:'cyberorbit_refresh='+secret,'x-cyberorbit-csrf':'1'})).status,401);
  const login=await post('/auth/login',{email:f.admin.email,password});assert.equal(login.status,200);assert.equal(login.data.requiresMfa,true);
  const verified=await post('/auth/mfa/verify',{challengeId:login.data.challengeId,otp:login.data.developmentOtp});assert.equal(verified.status,200);assert.ok(verified.data.token);
  assert.equal((await fetch(origin+'/api/auth/me',{headers:{Authorization:'Bearer '+verified.data.token}})).status,200);
  const headers={Authorization:'Bearer '+verified.data.token};
  const profile={name:'Monitoring only',email:`${randomUUID()}@test.invalid`,employeeId:randomUUID(),department:'ENGINEERING',role:'EMPLOYEE'};
  await f.prisma.role.create({data:{code:'MANAGER',name:'Manager'}});
  const manager=await post('/users',{...profile,email:`${randomUUID()}@test.invalid`,employeeId:randomUUID(),role:'MANAGER',assignedAdminId:f.admin.id},headers);
  assert.equal(manager.status,200);
  const storedManager=await f.prisma.user.findUnique({where:{id:manager.data.user.id}});
  assert.equal(storedManager.passwordHash,null);assert.equal(storedManager.roleCode,'MANAGER');
  profile.managerId=storedManager.id;
  const created=await post('/users',profile,headers);assert.equal(created.status,200);
  const stored=await f.prisma.user.findUnique({where:{id:created.data.user.id}});
  assert.equal(stored.passwordHash,null);assert.equal(stored.roleCode,'EMPLOYEE');
  const managerLogin=await post('/auth/login',{email:storedManager.email,password});
  assert.ok(managerLogin.status>=400);assert.equal(managerLogin.data.token,undefined);
  assert.equal((await post('/auth/login',{email:stored.email,password})).data.token,undefined);
  const refused=await post('/users',{...profile,password},headers);
  assert.equal(refused.status,400);assert.equal(refused.data.error.code,'EMPLOYEE_PASSWORD_NOT_ALLOWED');
  const edited=await fetch(origin+'/api/users/'+stored.id,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'Updated monitoring identity'})});
  assert.equal(edited.status,200);
  const passwordEdit=await fetch(origin+'/api/users/'+stored.id,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({password})});
  assert.equal(passwordEdit.status,400);assert.equal((await f.prisma.user.findUnique({where:{id:stored.id}})).passwordHash,null);
  assert.equal((await f.prisma.user.findUnique({where:{id:f.employee.id}})).status,'ACTIVE','Monitoring identity is retained');
  // Isolated fixture only: exercise desired OS state without an installed agent.
  const assignment=await post('/endpoint/assign',{userId:stored.id,name:'Account control test',platform:'win32',mappedIdentity:'S-1-5-21-111-222-333-1001'},headers);
  assert.equal(assignment.status,200);
  const enrolled=await post('/endpoint/enroll',{token:assignment.data.enrollmentToken,platform:'win32',agentVersion:'1.0.6'});
  assert.equal(enrolled.status,200);
  const deviceHeaders={Authorization:'Bearer '+enrolled.data.credential};
  const health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false};
  const heartbeat=()=>post('/endpoint/heartbeat',{agentVersion:'1.0.6',health},deviceHeaders);
  assert.equal((await heartbeat()).data.accountControl.action,'ALLOW');
  // Synthetic records in the isolated test database, not live collector evidence.
  const fixtureEvent=(type,name,age)=>({version:1,eventId:randomUUID(),deviceId:enrolled.data.deviceId,companyId:stored.companyId,userId:stored.id,type,occurredAt:new Date(Date.now()-age*1000),metadata:{pid:42,name,sessionId:'1'}});
  await f.prisma.endpointEvent.createMany({data:[fixtureEvent('APPLICATION_FOREGROUND','Any application',1000),...Array.from({length:170},(_,i)=>fixtureEvent('PROCESS_START','background fixture',i))]});
  const activity=await fetch(origin+'/api/endpoint/dashboard?eventType=APPLICATION_ACTIVITY&deviceId='+enrolled.data.deviceId,{headers});
  assert.equal(activity.status,200);const activityData=await activity.json();
  assert.equal(activityData.events.length,151);assert.ok(activityData.events.some(e=>e.type==='APPLICATION_FOREGROUND'));assert.equal(activityData.timeline.hasMore,true);
  assert.ok(activityData.events.every(e=>e.deviceId===enrolled.data.deviceId&&e.companyId===stored.companyId));
  const foreignActivity=await fetch(origin+'/api/endpoint/dashboard?eventType=APPLICATION_ACTIVITY&deviceId='+enrolled.data.deviceId,{headers:{Authorization:'Bearer '+generateJwtToken(f.otherAdmin,true)}});
  assert.equal(foreignActivity.status,404);
  const foreignFreeze=await post('/users/'+stored.id+'/freeze',{reason:'Test unauthorized company boundary'}, {Authorization:'Bearer '+generateJwtToken(f.otherAdmin,true)});
  assert.equal(foreignFreeze.status,404);
  assert.equal((await heartbeat()).data.accountControl.action,'ALLOW');
  assert.equal((await post('/users/'+stored.id+'/freeze',{reason:'Verified account containment'},headers)).status,200);
  const frozen=await heartbeat();assert.equal(frozen.status,200);assert.equal(frozen.data.accountControl.action,'BLOCK');
  assert.equal(frozen.data.accountControl.identity,'S-1-5-21-111-222-333-1001');assert.equal(frozen.data.accountControl.deviceId,enrolled.data.deviceId);
  const configPath='/endpoint/'+enrolled.data.deviceId+'/config';
  const pause=async auth=>fetch(origin+'/api'+configPath,{method:'PUT',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({config:{paused:true}})});
  // Neither a legacy employee/manager JWT nor an endpoint credential grants control.
  for(const deniedHeaders of [{},{Authorization:'Bearer '+oldJwt},{Authorization:'Bearer '+generateJwtToken(storedManager,true)},deviceHeaders]){
    assert.equal((await post('/users/'+stored.id+'/unfreeze',{},deniedHeaders)).status,401);
    assert.equal((await post('/devices/'+stored.id+'/unfreeze',{},deniedHeaders)).status,401);
    assert.equal((await pause(deniedHeaders)).status,401);
    assert.equal((await post('/endpoint/'+enrolled.data.deviceId+'/revoke',{},deniedHeaders)).status,401);
  }
  const foreignHeaders={Authorization:'Bearer '+generateJwtToken(f.otherAdmin,true)};
  assert.equal((await post('/users/'+stored.id+'/unfreeze',{reason:'Test unauthorized company boundary'},foreignHeaders)).status,404);
  assert.equal((await pause(foreignHeaders)).status,404);
  assert.equal((await post('/endpoint/'+enrolled.data.deviceId+'/revoke',{reason:'Cross-company revoke check'},foreignHeaders)).status,404);
  assert.equal((await heartbeat()).data.accountControl.action,'BLOCK');
  assert.equal((await heartbeat()).data.config.paused,false);
  await f.prisma.role.create({data:{code:'SYSTEM_ADMIN',name:'System administrator'}});
  for(const [roleCode,isMainAdmin] of [['SECURITY_ADMIN',false],['SYSTEM_ADMIN',false],['SYSTEM_ADMIN',true]]){
    const actor=await f.prisma.user.create({data:{name:'Control administrator',email:randomUUID()+'@test.invalid',employeeId:randomUUID(),companyId:stored.companyId,roleCode,isMainAdmin,status:'ACTIVE'}});
    const controlHeaders={Authorization:'Bearer '+generateJwtToken(actor,true)};
    const assign=await fetch(origin+'/api/users/'+storedManager.id,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({assignedAdminId:actor.id})});
    assert.equal(assign.status,200);
    assert.equal((await pause(controlHeaders)).status,200);
    assert.equal((await heartbeat()).data.config.paused,true);
    assert.equal((await post('/users/'+stored.id+'/unfreeze',{reason:'Incident reviewed and cleared'},controlHeaders)).status,200);
    assert.equal((await heartbeat()).data.accountControl.action,'ALLOW');
    assert.equal((await post('/users/'+stored.id+'/freeze',{reason:'Critical evidence remains active'},controlHeaders)).status,200);
    const audit=await f.prisma.auditLog.findFirst({where:{action:'AGENT_PAUSED',userId:actor.id}});
    assert.equal(audit.metadata.actorId,actor.id);assert.equal(audit.metadata.deviceId,enrolled.data.deviceId);
    await f.prisma.user.update({where:{id:actor.id},data:{status:'DISABLED'}});
    assert.equal((await pause(controlHeaders)).status,401);
    assert.equal((await post('/users/'+stored.id+'/unfreeze',{},controlHeaders)).status,401);
  }
  const {setAccount}=await import('../routes/security.js');
  await assert.rejects(setAccount({user:storedManager,params:{id:stored.id}},'ACTIVE'),e=>e.code==='ADMIN_REQUIRED');
  assert.equal((await post('/users/'+stored.id+'/unfreeze',{reason:'Administrative review completed'},headers)).status,200);
  assert.equal((await heartbeat()).data.accountControl.action,'ALLOW');
  assert.equal((await post('/endpoint/'+enrolled.data.deviceId+'/revoke',{reason:'Approved test credential revocation'},headers)).status,200);
  assert.equal(await f.prisma.auditLog.count({where:{action:'AGENT_REVOKED',userId:f.admin.id}}),1);
  assert.equal((await heartbeat()).status,401);
 }finally{
  if(previous===undefined)delete process.env.DEV_MFA_MODE;else process.env.DEV_MFA_MODE=previous;
  if(sse){for(const c of sse.clients)c.end();clearInterval(sse.heartbeatInterval);}if(server)await new Promise(r=>server.close(r));await f.close();
 }
});
