import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import {deviceFixture} from './device-fixture.js';

test('production Mailjet MFA and password reset preserve administrator authorization', {timeout:120000}, async t => {
  const keys=['NODE_ENV','DEV_MFA_MODE','MAILJET_API_KEY','MAILJET_SECRET_KEY','MAILJET_FROM_EMAIL','APP_URL'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  const f=await deviceFixture();let server;
  const realFetch=globalThis.fetch, messages=[];let rejectEmail=false;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(String(url).startsWith('http://127.0.0.1:')) return realFetch(url,options);
    assert.equal(url,'https://api.mailjet.com/v3.1/send','No unmocked external requests');
    const message=JSON.parse(options.body).Messages[0];messages.push(message);
    return rejectEmail ? Response.json({Messages:[{Status:'error',Errors:[{ErrorMessage:'Private provider error'}]}]}) :
      Response.json({Messages:[{Status:'success',To:[{Email:message.To[0].Email,MessageUUID:'test-id'}]}]});
  });
  try {
    Object.assign(process.env,{NODE_ENV:'production',DEV_MFA_MODE:'true',MAILJET_API_KEY:'test-key',MAILJET_SECRET_KEY:'test-secret',MAILJET_FROM_EMAIL:'sender@example.com',APP_URL:'https://cyberorbit-backend.onrender.com'});
    // Intentionally true above: production must still NEVER expose a development OTP.
    const password='Mailjet-fixture-password-2026';
    await f.prisma.user.update({where:{id:f.admin.id},data:{passwordHash:await bcrypt.hash(password,12)}});
    const {default:routes}=await import('../routes/index.js');
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    const base='http://127.0.0.1:'+server.address().port+'/api';
    const post=async(path,body,token)=>{
      const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
      return {status:r.status,data:await r.json(),cookies:r.headers.getSetCookie()};
    };
    const otp=()=>messages.at(-1).TextPart.match(/code is: (\d{6})/)[1];
    const login=async email=>{
      const result=await post('/auth/login',{email,password});assert.equal(result.status,200);
      assert.equal(result.data.requiresMfa,true);assert.equal(result.data.developmentOtp,undefined);assert.equal(result.data.token,undefined);
      assert.equal(messages.at(-1).To[0].Email,email);return result;
    };
    const main=await login(f.admin.email);
    const verified=await post('/auth/mfa/verify',{challengeId:main.data.challengeId,otp:otp()});
    assert.equal(verified.status,200);assert.ok(verified.data.token);
    assert.equal((await post('/auth/mfa/verify',{challengeId:main.data.challengeId,otp:otp()})).status,401);
    const newAdmin=await post('/admins',{name:'Mailjet administrator',email:'new-admin@example.test',password,roleCode:'SECURITY_ADMIN'},verified.data.token);
    assert.equal(newAdmin.status,200);const admin=newAdmin.data.admin;
    const second=await login(admin.email);const firstOtp=otp();
    assert.equal((await post('/auth/mfa/resend',{challengeId:second.data.challengeId})).status,429);
    await f.prisma.mfaSession.update({where:{id:second.data.challengeId},data:{createdAt:new Date(Date.now()-31000)}});
    const resent=await post('/auth/mfa/resend',{challengeId:second.data.challengeId});assert.equal(resent.status,200);
    assert.equal(messages.at(-1).To[0].Email,admin.email);assert.equal(resent.data.developmentOtp,undefined);
    assert.equal((await post('/auth/mfa/verify',{challengeId:second.data.challengeId,otp:firstOtp})).status,401);
    assert.equal((await post('/auth/mfa/verify',{challengeId:resent.data.challengeId,otp:'000000'})).status,401);
    const secondVerified=await post('/auth/mfa/verify',{challengeId:resent.data.challengeId,otp:otp()});assert.equal(secondVerified.status,200);
    assert.equal((await post('/admins',{name:'Forbidden'},secondVerified.data.token)).status,403);
    const expired=await login(admin.email);
    await f.prisma.mfaSession.update({where:{id:expired.data.challengeId},data:{expiresAt:new Date(Date.now()-1)}});
    assert.equal((await post('/auth/mfa/verify',{challengeId:expired.data.challengeId,otp:otp()})).status,401);
    assert.equal((await post('/auth/login',{email:admin.email,password:'wrong'})).status,401);
    await f.prisma.user.update({where:{id:f.employee.id},data:{passwordHash:await bcrypt.hash(password,12)}});
    assert.equal((await post('/auth/login',{email:f.employee.email,password})).status,403);
    rejectEmail=true;
    const sessionCount=await f.prisma.session.count({where:{userId:admin.id}});
    const failed=await post('/auth/login',{email:admin.email,password});assert.equal(failed.status,503);
    assert.equal(failed.data.token,undefined);assert.equal(failed.cookies.length,0);
    assert.equal(await f.prisma.session.count({where:{userId:admin.id}}),sessionCount);
    const failedChallenge=await f.prisma.mfaSession.findFirst({where:{userId:admin.id},orderBy:{createdAt:'desc'}});
    assert.equal(failedChallenge.status,'FAILED');
    assert.equal((await post('/auth/mfa/verify',{challengeId:failedChallenge.id,otp:otp()})).status,401);
    rejectEmail=false;
    const retryChallenge=await login(admin.email);
    const retryOtp=otp();
    await f.prisma.mfaSession.update({where:{id:retryChallenge.data.challengeId},data:{createdAt:new Date(Date.now()-31000)}});
    rejectEmail=true;
    assert.equal((await post('/auth/mfa/resend',{challengeId:retryChallenge.data.challengeId})).status,503);
    assert.equal((await post('/auth/mfa/verify',{challengeId:retryChallenge.data.challengeId,otp:retryOtp})).status,401);
    assert.equal(await f.prisma.session.count({where:{userId:admin.id}}),sessionCount);
    assert.equal((await post('/auth/forgot-password',{email:admin.email})).status,503);
    assert.equal(await f.prisma.passwordResetToken.count({where:{userId:admin.id,usedAt:null}}),0);
    rejectEmail=false;
    assert.equal((await post('/auth/forgot-password',{email:admin.email})).status,200);
    assert.equal(messages.at(-1).To[0].Email,admin.email);
    const resetToken=new URL(messages.at(-1).TextPart.match(/https:\/\/\S+/)[0]).searchParams.get('token');
    const newPassword='Mailjet-replacement-password-2026';
    assert.equal((await post('/auth/reset-password',{token:resetToken,newPassword})).status,200);
    assert.equal((await post('/auth/reset-password',{token:resetToken,newPassword})).status,400);
    assert.equal(await f.prisma.session.count({where:{userId:admin.id,revokedAt:null}}),0);
    assert.ok(await bcrypt.compare(newPassword,(await f.prisma.user.findUnique({where:{id:admin.id}})).passwordHash));
    assert.equal((await post('/auth/forgot-password',{email:admin.email})).status,200);
    const expiredToken=new URL(messages.at(-1).TextPart.match(/https:\/\/\S+/)[0]).searchParams.get('token');
    await f.prisma.passwordResetToken.updateMany({where:{userId:admin.id,usedAt:null},data:{expiresAt:new Date(Date.now()-1)}});
    assert.equal((await post('/auth/reset-password',{token:expiredToken,newPassword})).status,400);
    const before=messages.length;
    assert.equal((await post('/auth/forgot-password',{email:'unknown@example.test'})).status,200);assert.equal(messages.length,before);
    const challengeAudit=await f.prisma.auditLog.findFirst({where:{userId:admin.id,action:'MFA_CHALLENGE'}});
    assert.equal(challengeAudit.metadata.delivery,'mailjet-api');
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await f.close();
    for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
  }
});
