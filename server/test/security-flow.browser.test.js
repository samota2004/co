import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import bcrypt from 'bcryptjs';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {browser,waitUntil} from './browser-tools.js';

test('real browser password/OTP login, admin resource creation and employee login denial',{timeout:180000},async()=>{
 const f=await deviceFixture();let server,b,sse,profile;
 const previous=process.env.DEV_MFA_MODE,previousOrigin=process.env.FRONTEND_URL;process.env.DEV_MFA_MODE='true';
 try{
  const password='Isolated-browser-test-password';
  await f.prisma.user.updateMany({where:{id:{in:[f.admin.id,f.employee.id]}},data:{passwordHash:await bcrypt.hash(password,12)}});
  const {default:routes}=await import('../routes/index.js');
  const {DEFAULT_POLICY}=await import('../services/policy-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);app.use(express.static(path.join(projectRoot,'client/dist')));app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const origin='http://127.0.0.1:'+server.address().port;
  process.env.FRONTEND_URL=origin;
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-security-browser-'));b=await browser(profile);
  const exceptions=[],requests=[];
  b.listeners.push(m=>{if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);if(m.method==='Network.responseReceived'&&m.params.response.url.startsWith(origin+'/api/'))requests.push({path:new URL(m.params.response.url).pathname,status:m.params.response.status});});
  await b.command('Runtime.enable');await b.command('Network.enable');await b.command('Page.enable');
  await b.command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
  const enter=(selector,value)=>b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const login=async email=>{
   await b.command('Page.navigate',{url:origin+'/login'});await waitUntil(b,"document.querySelector('#username-email-input')",'login form');
   await enter('#username-email-input',email);await enter('#password-input',password);await b.evaluate("document.querySelector('#btn-login-submit').click()");
   await waitUntil(b,"document.querySelector('#otp-input-0') && document.body.innerText.includes('Local development MFA code:')",'real one-time challenge');
   const code=await b.evaluate("document.body.innerText.match(/Local development MFA code: (\\d{6})/)[1]");
   for(let i=0;i<6;i++)await enter('#otp-input-'+i,code[i]);
   await b.evaluate("document.querySelector('#btn-mfa-verify-submit').click()");await waitUntil(b,"Boolean(localStorage.getItem('zero_trust_token')) && Boolean(document.querySelector('main'))",'authenticated console');
  };
  await login(f.admin.email);await b.command('Page.navigate',{url:origin+'/resources'});
  await waitUntil(b,"document.querySelector('[aria-label=\"Resource name\"]')",'authorized resource form');
  await enter('[aria-label="Resource name"]','Browser protected project');await enter('[aria-label="Description"]','Public catalog <img src=x onerror="window.orbitXssExecuted=true">');
  await enter('[aria-label="Protected resource data"]','Private isolated resource fixture');
  await b.evaluate("Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='Create resource').click()");
  await waitUntil(b,"document.querySelector('main').textContent.includes('Browser protected project')",'persisted resource catalog');
  assert.equal(await b.evaluate('Boolean(window.orbitXssExecuted)'),false,'Stored catalog markup must render as text, not executable HTML');
  assert.equal(await b.evaluate("document.querySelector('main').textContent.includes('<img src=x')"),true);
  const resource=await f.prisma.resource.findFirst({where:{name:'Browser protected project'}});assert.equal(resource.protectedData.text,'Private isolated resource fixture');
  await f.prisma.zeroTrustPolicy.upsert({where:{companyId:'A'},create:{companyId:'A',config:{...DEFAULT_POLICY,mfaThreshold:10}},update:{config:{...DEFAULT_POLICY,mfaThreshold:10}}});
  await b.evaluate("fetch('/api/auth/logout',{method:'POST'}).then(r=>{if(!r.ok)throw new Error('Test logout failed');localStorage.clear();})");
  await b.command('Page.navigate',{url:origin+'/login'});
  await waitUntil(b,"document.querySelector('#username-email-input')",'login form');
  await enter('#username-email-input',f.employee.email);await enter('#password-input',password);
  await b.evaluate("document.querySelector('#btn-login-submit').click()");
  await waitUntil(b,"document.body.textContent.includes('Console access is restricted to administrators.')",'employee login denial');
  assert.equal(await b.evaluate("Boolean(localStorage.getItem('zero_trust_token'))"),false);
  assert.equal(await b.evaluate("Boolean(document.querySelector('#otp-input-0'))"),false);
  assert.equal((await f.prisma.resource.findUnique({where:{id:resource.id}})).accessCount,0);
  assert.deepEqual(exceptions,[]);assert.ok(!requests.some(r=>r.status===404||r.status>=500));
  assert.ok(requests.some(r=>r.path==='/api/auth/login'&&r.status===403));

 }finally{
  if(previous===undefined)delete process.env.DEV_MFA_MODE;else process.env.DEV_MFA_MODE=previous;
  if(previousOrigin===undefined)delete process.env.FRONTEND_URL;else process.env.FRONTEND_URL=previousOrigin;
  if(b)await b.close();if(sse){for(const c of sse.clients)c.end();clearInterval(sse.heartbeatInterval);}if(server)await new Promise(r=>server.close(r));await f.close();
  if(profile&&path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});
 }
});
