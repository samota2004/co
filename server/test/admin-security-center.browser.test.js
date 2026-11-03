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
  await f.prisma.securityNotification.create({data:{companyId:'A',recipientId:f.admin.id,targetUserId:null,dedupeKey:`browser-fixture:${randomUUID()}`,type:'ENDPOINT_USB_CONNECTED',severity:'MEDIUM',title:'USB device connection observed',message:'A USB device connection was observed on enrolled endpoint "browser fixture". Connection does not confirm storage access, file access, or data transfer.',metadata:{syntheticTest:true,deviceId:'browser-fixture-device',category:'OTHER'}}});
  await f.prisma.riskScore.create({data:{userId:target.id,score:34,level:'LOW',factors:[{factor:'Synthetic browser fixture assessment'}]}});
  await f.prisma.trustHistory.create({data:{userId:target.id,trustScore:82,riskScore:34,reason:'Synthetic browser fixture',delta:0}});
  await f.prisma.session.create({data:{sessionToken:randomUUID(),userId:target.id,ip:'192.0.2.15',userAgent:'Synthetic admin browser',mfaVerifiedAt:new Date(),expiresAt:new Date(Date.now()+3600000)}});
  const {default:routes}=await import('../routes/index.js');const {generateJwtToken}=await import('../middleware/auth.js');sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);app.use(express.static(path.join(projectRoot,'client/dist')));app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-admin-center-'));b=await browser(profile);const errors=[];b.listeners.push(message=>{if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
  await b.command('Runtime.enable');await b.command('Page.enable');const token=generateJwtToken(f.admin,true),user={...f.admin,passwordHash:undefined};await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(token)});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(user))});window.__notificationFetchCount=0;window.__notificationPollIntervalMs=null;window.__notificationPoll=null;const nativeSetInterval=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>{if(ms===60000){window.__notificationPollIntervalMs=ms;window.__notificationPoll=fn;}return nativeSetInterval(fn,ms,...args);};const nativeFetch=window.fetch.bind(window);window.fetch=(input,...args)=>{if(String(input).includes('/api/notifications?limit=50'))window.__notificationFetchCount++;return nativeFetch(input,...args);};`});
  const origin='http://127.0.0.1:'+server.address().port;await b.command('Page.navigate',{url:origin+'/dashboard'});
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Administrator Intelligence') && document.querySelector('main')?.textContent.includes('Synthetic SOC administrator')",'administrator row renders');
  await waitUntil(b,"document.querySelector('[aria-label^=Notifications]')?.getAttribute('aria-label').includes('1 unread')",'notification bell shows unread count');await b.evaluate("document.querySelector('[aria-label^=Notifications]').click()");await waitUntil(b,"document.querySelector('[aria-label=\"Security notifications\"]')?.textContent.includes('USB device connection observed')",'notification center displays persisted USB alert');
  assert.equal(await b.evaluate('window.__notificationPollIntervalMs'),60000,'persisted-notification refresh interval is exactly 60 seconds');
  const initialFetches=await b.evaluate('window.__notificationFetchCount');await b.evaluate("document.dispatchEvent(new Event('visibilitychange'))");await waitUntil(b,`window.__notificationFetchCount>${initialFetches}`,'visibility/focus refresh retrieves persisted notifications');
  const focusFetches=await b.evaluate('window.__notificationFetchCount');await b.evaluate('window.__notificationPoll()');await waitUntil(b,`window.__notificationFetchCount>${focusFetches}`,'60-second poll callback retrieves persisted notifications');
  await b.evaluate("Array.from(document.querySelectorAll('main tr[role=button]')).find(row=>row.textContent.includes('Synthetic SOC administrator')).click()");
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('ADMINISTRATOR SECURITY CENTER') && document.querySelector('main')?.textContent.includes('Active sessions')",'selected administrator details render');
  const body=await b.evaluate('document.querySelector("main").innerText');assert.ok(body.includes('34/100'));assert.ok(body.includes('82/100'));assert.ok(body.includes('192.0.2.15'));assert.ok(body.includes('Risk and trust history'));assert.deepEqual(errors,[]);
 }finally{if(b)await b.close();if(server)await new Promise(resolve=>server.close(resolve));if(sse){for(const client of sse.clients)client.end();clearInterval(sse.heartbeatInterval);}await f.close();if(profile&&path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});}
});
