import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import {deviceFixture} from './device-fixture.js';

test('real OTP challenge lifecycle, employee login, registered browser and logout',{timeout:60000},async()=>{
 const f=await deviceFixture();let server,sse;const previous=process.env.DEV_MFA_MODE;process.env.DEV_MFA_MODE='true';
 try{
  const password='Isolated-Test-Password-2026';
  await f.prisma.user.update({where:{id:f.employee.id},data:{passwordHash:await bcrypt.hash(password,12),passwordChangedAt:new Date()}});
  const {default:routes}=await import('../routes/index.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  const origin='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,headers={})=>{const r=await fetch(origin+'/api'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookies:r.headers.getSetCookie()};};
  assert.equal((await call('/auth/login',{email:f.employee.email,password:'WrongPassword'})).status,401);
  const login=await call('/auth/login',{email:f.employee.employeeId,password});assert.equal(login.status,200);assert.equal(login.data.requiresMfa,true);
  assert.match(login.data.developmentOtp,/^[0-9]{6}$/);assert.equal(login.data.user.passwordHash,undefined);
  const verified=await call('/auth/mfa/verify',{challengeId:login.data.challengeId,otp:login.data.developmentOtp});assert.equal(verified.status,200);assert.ok(verified.data.token);
  assert.equal((await call('/auth/mfa/verify',{challengeId:login.data.challengeId,otp:login.data.developmentOtp})).status,401);
  const me=await fetch(origin+'/api/auth/me',{headers:{Authorization:'Bearer '+verified.data.token}});assert.equal(me.status,200);
  const browserCookie=verified.cookies.find(c=>c.startsWith('orbit_browser=')).split(';')[0];
  assert.equal(await f.prisma.device.count({where:{userId:f.employee.id,fingerprint:{not:null}}}),1);
  const fresh=await call('/auth/login',{email:f.employee.email,password},{Cookie:browserCookie});
  // Registered low-risk browser skips MFA during configured office hours only.
  if(new Date().getUTCHours()>=9&&new Date().getUTCHours()<18){assert.equal(fresh.data.requiresMfa,false);assert.ok(fresh.data.token);}else assert.equal(fresh.data.requiresMfa,true);
  const challenge=await call('/auth/mfa/challenge',{}, {Authorization:'Bearer '+verified.data.token});assert.equal(challenge.status,200);
  const wrong=challenge.data.developmentOtp==='000000'?'000001':'000000';
  const attempts=await Promise.all(Array.from({length:7},()=>call('/auth/mfa/verify',{challengeId:challenge.data.challengeId,otp:wrong})));
  assert.ok(attempts.every(r=>r.status===401));assert.equal((await f.prisma.mfaSession.findUnique({where:{id:challenge.data.challengeId}})).attempts,5);
  const newLogin=await call('/auth/login',{email:f.employee.email,password});
  await f.prisma.mfaSession.update({where:{id:newLogin.data.challengeId},data:{expiresAt:new Date(Date.now()-1)}});
  assert.equal((await call('/auth/mfa/verify',{challengeId:newLogin.data.challengeId,otp:newLogin.data.developmentOtp})).status,401);
  const device=await f.prisma.device.findFirst({where:{userId:f.employee.id,fingerprint:{not:null}}});
  await f.prisma.device.update({where:{id:device.id},data:{status:'SUSPICIOUS',isTrusted:false,trustScore:20}});
  const untrustedLogin=await call('/auth/login',{email:f.employee.email,password},{Cookie:browserCookie});assert.equal(untrustedLogin.data.requiresMfa,true);
  const untrustedVerified=await call('/auth/mfa/verify',{challengeId:untrustedLogin.data.challengeId,otp:untrustedLogin.data.developmentOtp},{Cookie:browserCookie});assert.equal(untrustedVerified.status,200);
  assert.equal((await f.prisma.device.findUnique({where:{id:device.id}})).isTrusted,false,'MFA must not attest or restore browser posture');
  await f.prisma.device.update({where:{id:device.id},data:{status:'REVOKED'}});
  const revokedLogin=await call('/auth/login',{email:f.employee.email,password},{Cookie:browserCookie});
  assert.equal((await call('/auth/mfa/verify',{challengeId:revokedLogin.data.challengeId,otp:revokedLogin.data.developmentOtp},{Cookie:browserCookie})).data.error.code,'DEVICE_REVOKED');
  const logout=await call('/auth/logout',{}, {Authorization:'Bearer '+verified.data.token,'x-cyberorbit-csrf':'1'});assert.equal(logout.status,200);
  assert.equal((await fetch(origin+'/api/auth/me',{headers:{Authorization:'Bearer '+verified.data.token}})).status,401);
  assert.equal(await f.prisma.session.count({where:{userId:f.employee.id,revokedAt:null}}),0);
  const passwordLogin=await call('/auth/login',{email:f.employee.email,password});
  const passwordVerified=await call('/auth/mfa/verify',{challengeId:passwordLogin.data.challengeId,otp:passwordLogin.data.developmentOtp});assert.equal(passwordVerified.status,200);
  const passwordHeaders={Authorization:'Bearer '+passwordVerified.data.token};
  assert.equal((await call('/auth/password/change',{currentPassword:'Incorrect-password',newPassword:'New-isolated-test-password'},passwordHeaders)).data.error.code,'INCORRECT_PASSWORD');
  assert.equal((await fetch(origin+'/api/auth/me',{headers:passwordHeaders})).status,200,'Incorrect current password must not end a valid session');
  assert.equal((await call('/auth/password/change',{currentPassword:password,newPassword:'New-isolated-test-password'},passwordHeaders)).status,200);
  assert.equal((await fetch(origin+'/api/auth/me',{headers:passwordHeaders})).status,401);
  assert.equal(await bcrypt.compare('New-isolated-test-password',(await f.prisma.user.findUnique({where:{id:f.employee.id}})).passwordHash),true);
 }finally{if(previous===undefined)delete process.env.DEV_MFA_MODE;else process.env.DEV_MFA_MODE=previous;if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(r=>server.close(r));await f.close();}
});
