import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {browser,waitUntil} from './browser-tools.js';

test('administrator dashboard rows open the selected administrator security center',{skip:!process.env.DATABASE_URL,timeout:180000},async()=>{
 const f=await deviceFixture();let server,b,profile,sse;
 try{
  await f.prisma.role.create({data:{code:'SYSTEM_ADMIN',name:'System administrator'}});
  const target=await f.prisma.user.create({data:{name:'Synthetic SOC administrator',employeeId:randomUUID(),email:randomUUID()+'@test.invalid',companyId:'A',roleCode:'SYSTEM_ADMIN',departmentCode:'ENGINEERING',status:'ACTIVE',riskScore:34,riskLevel:'LOW',trustScore:82,trustUpdatedAt:new Date()}});
  await f.prisma.securityNotification.create({data:{companyId:'A',recipientId:f.admin.id,targetUserId:target.id,dedupeKey:`browser-fixture:${randomUUID()}`,type:'SECURITY_INCIDENT',severity:'HIGH',title:'Synthetic browser notification',message:'Test-only administrator notification.',metadata:{syntheticTest:true}}});
  await f.prisma.riskScore.create({data:{userId:target.id,score:34,level:'LOW',factors:[{factor:'Synthetic browser fixture assessment'}]}});
  await f.prisma.trustHistory.create({data:{userId:target.id,trustScore:82,riskScore:34,reason:'Synthetic browser fixture',delta:0}});
  await f.prisma.session.create({data:{sessionToken:randomUUID(),userId:target.id,ip:'192.0.2.15',userAgent:'Synthetic admin browser',mfaVerifiedAt:new Date(),expiresAt:new Date(Date.now()+3600000)}});
  const {default:routes}=await import('../routes/index.js');const {generateJwtToken}=await import('../middleware/auth.js');sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);app.use(express.static(path.join(projectRoot,'client/dist')));app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-admin-center-'));b=await browser(profile);const errors=[];b.listeners.push(message=>{if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
  await b.command('Runtime.enable');await b.command('Page.enable');const token=generateJwtToken(f.admin,true),user={...f.admin,passwordHash:undefined};await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(token)});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(user))});`});
  const origin='http://127.0.0.1:'+server.address().port;await b.command('Page.navigate',{url:origin+'/dashboard'});
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Administrator Intelligence') && document.querySelector('main')?.textContent.includes('Synthetic SOC administrator')",'administrator row renders');
  await waitUntil(b,"document.querySelector('[aria-label^=Notifications]')?.getAttribute('aria-label').includes('1 unread')",'notification bell shows unread count');await b.evaluate("document.querySelector('[aria-label^=Notifications]').click()");await waitUntil(b,"document.querySelector('[aria-label=\"Security notifications\"]')?.textContent.includes('Synthetic browser notification')",'notification center displays persisted alert');
  await b.evaluate("Array.from(document.querySelectorAll('main tr[role=button]')).find(row=>row.textContent.includes('Synthetic SOC administrator')).click()");
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('ADMINISTRATOR SECURITY CENTER') && document.querySelector('main')?.textContent.includes('Active sessions')",'selected administrator details render');
  const body=await b.evaluate('document.querySelector("main").innerText');assert.ok(body.includes('34/100'));assert.ok(body.includes('82/100'));assert.ok(body.includes('192.0.2.15'));assert.ok(body.includes('Risk and trust history'));assert.deepEqual(errors,[]);
 }finally{if(b)await b.close();if(server)await new Promise(resolve=>server.close(resolve));if(sse){for(const client of sse.clients)client.end();clearInterval(sse.heartbeatInterval);}await f.close();if(profile&&path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
});
