import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { deviceFixture, projectRoot } from './device-fixture.js';
import { hashSecret } from '../services/endpoint-service.js';
import { randomUUID } from 'node:crypto';
import { build } from 'vite';
const browserPath=process.env.CYBERORBIT_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const hasBrowser=await fs.access(browserPath).then(()=>true).catch(()=>false);

import {browser,waitUntil} from './browser-tools.js';
const panel='document.querySelector(\'[aria-label="Installed endpoint agents"]\')';
const click=(b,label,root=panel)=>b.evaluate(`Array.from(${root}.querySelectorAll('button')).find(x=>x.textContent.trim()===${JSON.stringify(label)}).click()`);
const value=(b,label,text)=>b.evaluate(`(()=>{const e=${panel}.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
const contains=text=>`${panel}.textContent.includes(${JSON.stringify(text)})`;

test('actual Devices page clicks, browser console/network and PostgreSQL assignment/token/refresh',{skip:!process.env.DATABASE_URL||!hasBrowser,timeout:180000},async()=>{
  const f=await deviceFixture();let server,b,sse,profile;const exceptions=[],consoleErrors=[],network=[];
  let failDashboard=false,slowDashboard=false;
  try{
    profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-buttons-browser-'));
    const clientBuild=path.join(profile,'client-dist');
    const nodeEnv=process.env.NODE_ENV;
    try{await build({configFile:path.join(projectRoot,'client/vite.config.js'),root:path.join(projectRoot,'client'),logLevel:'error',build:{outDir:clientBuild,emptyOutDir:true}});}
    finally{if(nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=nodeEnv;}
    const {default:api}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const {db}=await import('../models/db.js');sse=(await import('../services/sse.js')).sseManager;
    await db.initDatabaseLayer();
    const app=express();app.use(express.json());
    app.use('/api/endpoint/dashboard',async(req,res,next)=>{
      if(slowDashboard)await new Promise(r=>setTimeout(r,500));
      if(failDashboard){res.status(503).json({success:false,error:'Database temporarily unavailable (test outage).'});return;}next();
    });
    app.use('/api',api);app.use(express.static(clientBuild));app.get('*',(req,res)=>res.sendFile(path.join(clientBuild,'index.html')));
    server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const origin=`http://127.0.0.1:${server.address().port}`;
    b=await browser(path.join(profile,'chrome-profile'));
    b.listeners.push(m=>{
      if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if(m.method==='Runtime.consoleAPICalled' && m.params.type==='error')consoleErrors.push(m.params.args.map(a=>a.value || a.description || '').join(' '));
      if(m.method==='Network.responseReceived'&&m.params.response.url.startsWith(`${origin}/api/`)){const url=new URL(m.params.response.url);network.push({path:url.pathname,search:url.search,status:m.params.response.status});}
    });
    await b.command('Runtime.enable');await b.command('Network.enable');await b.command('Page.enable');
    // Typography is external to the button flow. Avoid stylesheet requests
    // delaying module execution when this test environment has no internet.
    await b.command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
    await b.send('Browser.grantPermissions',{origin,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
    const token=generateJwtToken(f.admin,true),user={...f.admin,passwordHash:undefined};
    await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(token)});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(user))});`});
    failDashboard=true;
    await b.command('Page.navigate',{url:`${origin}/devices`});
    await waitUntil(b,`${panel} && ${contains('Database temporarily unavailable')}`,'initial employee fetch failure');
    assert.equal(await b.evaluate(`${panel}.querySelector('[aria-label="Employee"]').disabled`),true);
    assert.equal(await b.evaluate(`${panel}.querySelector('[aria-label="Employee"]').options[0].textContent`),'Employee list unavailable');
    failDashboard=false;await click(b,'Refresh');
    await waitUntil(b,`${panel} && ${panel}.querySelector('[aria-label="Employee"]').options.length===3 && ${panel}.getAttribute('aria-busy')==='false'`,'real Devices page with company employees');
    await click(b,'Assign');await waitUntil(b,contains('Select an active employee'),'assignment validation');assert.equal(await f.prisma.endpointDevice.count(),0);
    await click(b,'Issue Enrollment Token');await waitUntil(b,contains('Assign a device before'),'token validation');
    await value(b,'Employee',f.employee.id);await value(b,'Laptop name','Browser-tested laptop');await click(b,'Assign');
    await waitUntil(b,contains('Assigned Browser-tested laptop to Assigned employee.'),'saved assignment confirmation');
    let stored=await f.prisma.endpointDevice.findFirst({where:{name:'Browser-tested laptop'}});assert.equal(stored.userId,f.employee.id);assert.equal(stored.enrollmentHash,null);
    assert.equal(await b.evaluate(`Boolean(${panel}.querySelector('[aria-label="Enrollment token"]'))`),false);
    await click(b,'Issue Enrollment Token');await waitUntil(b,`${panel}.querySelector('[aria-label="Enrollment token"]')`,'issued token');
    const issued=await b.evaluate(`${panel}.querySelector('[aria-label="Enrollment token"]').textContent`);stored=await f.prisma.endpointDevice.findUnique({where:{id:stored.id}});assert.equal(stored.enrollmentHash,hashSecret(issued));
    await b.command('Page.bringToFront');await click(b,'Copy token');await waitUntil(b,contains('Copied'),'clipboard success');assert.equal(await b.evaluate('navigator.clipboard.readText()'),issued);
    await click(b,'Dismiss token');assert.equal(await b.evaluate(`Boolean(${panel}.querySelector('[aria-label="Enrollment token"]'))`),false);
    await click(b,'Refresh');await waitUntil(b,contains('Device list refreshed.'),'panel refresh');assert.equal(await b.evaluate(`Boolean(${panel}.querySelector('[aria-label="Enrollment token"]'))`),false);
    // Actual backend validation: invalid OS identity must not produce success.
    await value(b,'Verified OS identity','invalid-sid');await click(b,'Issue Enrollment Token');await waitUntil(b,contains('Save changes to the assignment before issuing a token.'),'unsaved mapping validation');
    await click(b,'Assign');await waitUntil(b,contains('Use verified Windows SID or uid:number'),'backend validation error');
    assert.equal((await f.prisma.endpointDevice.findUnique({where:{id:stored.id}})).mappedIdentity,null);
    await value(b,'Verified OS identity','');await value(b,'Employee',f.employee2.id);await click(b,'Assign');await waitUntil(b,contains('Assigned Browser-tested laptop to Second employee.'),'existing device reassignment');
    assert.equal(await f.prisma.endpointDevice.count(),1);assert.equal((await f.prisma.endpointDevice.findUnique({where:{id:stored.id}})).userId,f.employee2.id);
    // Registry Refresh reloads both stores, including a row added after initial load.
    await f.prisma.device.create({data:{deviceId:'browser-refresh-device',userId:f.employee.id,name:'Registry refresh laptop',os:'Windows',browser:'Chrome',ip:'127.0.0.1',location:'Test'}});
    slowDashboard=true;await b.evaluate('document.querySelector(\'[aria-label="Refresh device registry"]\').click()');
    await waitUntil(b,`${panel}.getAttribute('aria-busy')==='true'`,'loading indicator');
    await waitUntil(b,`document.querySelector('main').textContent.includes('Registry refresh laptop') && ${panel}.getAttribute('aria-busy')==='false'`,'registry refresh from database');slowDashboard=false;
    failDashboard=true;await click(b,'Refresh');await waitUntil(b,contains('Database temporarily unavailable'),'refresh backend error');
    assert.equal(await b.evaluate(`${panel}.querySelectorAll('article').length`),1);
    failDashboard=false;await click(b,'Refresh');await waitUntil(b,`${panel}.getAttribute('aria-busy')==='false' && !${contains('Database temporarily unavailable')}`,'refresh recovery');
    await f.prisma.user.updateMany({where:{id:{in:[f.employee.id,f.employee2.id]}},data:{status:'DISABLED'}});
    await click(b,'Refresh');await waitUntil(b,contains('No active employees in your company.'),'honest empty employee list');
    assert.equal(await b.evaluate(`${panel}.querySelector('[aria-label="Employee"]').disabled`),true);
    await f.prisma.user.updateMany({where:{id:{in:[f.employee.id,f.employee2.id]}},data:{status:'ACTIVE'}});
    await click(b,'Refresh');await waitUntil(b,`${panel}.querySelector('[aria-label="Employee"]').options.length===3 && ${panel}.getAttribute('aria-busy')==='false'`,'employee list recovery');
    // Regression fixtures only: process noise must not hide the usage view.
    const timelineRow=(type,name,age)=>({version:1,eventId:randomUUID(),deviceId:stored.id,companyId:'A',userId:f.employee2.id,type,occurredAt:new Date(Date.now()-age*1000),metadata:{pid:42,name,sessionId:'1',...(type==='APPLICATION_USAGE'?{durationSeconds:10}:{})}});
    const usageRows=[timelineRow('APPLICATION_USAGE','Notepad',700),timelineRow('APPLICATION_USAGE','brave',600)];
    await f.prisma.endpointEvent.createMany({data:[...usageRows,...Array.from({length:180},(_,i)=>timelineRow('PROCESS_RUNNING','fixture-process',i))]});
    const usageResponse=await fetch(`${origin}/api/endpoint/dashboard?eventType=APPLICATION_USAGE`,{headers:{Authorization:`Bearer ${token}`}});
    assert.equal(usageResponse.status,200);
    const usageDashboard=await usageResponse.json();
    assert.deepEqual(new Set(usageDashboard.events.map(e=>e.eventId)),new Set(usageRows.map(e=>e.eventId)),'database filtering returns both usage events before the process-event limit');
    assert.equal(usageDashboard.events.length,2);
    await click(b,'Refresh');
    await waitUntil(b,`${panel}.querySelector('[aria-label="Show Notepad usage"]') && ${panel}.querySelector('[aria-label="Show Brave usage"]')`,'application summaries rendered from filtered response');
    assert.equal(await b.evaluate(`${panel}.querySelectorAll('[aria-label="Endpoint activity timeline"] li').length`),0,'summary view intentionally hides detail rows until an application is selected');
    assert.ok(await b.evaluate(`${panel}.querySelector('[aria-label="Show Notepad usage"]').textContent.includes('1 recorded observations')`));
    await b.evaluate(`${panel}.querySelector('[aria-label="Show Notepad usage"]').click()`);
    await waitUntil(b,`${panel}.querySelector('[data-event-id="${usageRows[0].eventId}"]')`,'Notepad detail row');
    assert.equal(await b.evaluate(`${panel}.querySelectorAll('[aria-label="Endpoint activity timeline"] li').length`),1);
    assert.equal(await b.evaluate(`${panel}.querySelector('[data-event-id="${usageRows[0].eventId}"] strong').textContent`),'Notepad');
    assert.ok(await b.evaluate(`${panel}.querySelector('[data-event-id="${usageRows[0].eventId}"]').innerText.includes('10 seconds foreground usage')`));
    assert.equal(await b.evaluate(`${panel}.querySelector('[data-event-id="${usageRows[0].eventId}"] details').open`),false);
    await b.evaluate(`${panel}.querySelector('[aria-label="Application details"] button').click()`);
    await value(b,'Find an application','notepad');
    await waitUntil(b,`${panel}.querySelector('[aria-label="Show Notepad usage"]') && !${panel}.querySelector('[aria-label="Show Brave usage"]')`,'application summary search filter');
    await b.evaluate(`${panel}.querySelector('[aria-label="Show Notepad usage"]').click()`);
    await waitUntil(b,`${panel}.querySelector('[data-event-id="${usageRows[0].eventId}"]')`,'filtered Notepad detail');
    await b.evaluate(`${panel}.querySelector('[aria-label="Application details"] button').click()`);
    await value(b,'Find an application','');
    await waitUntil(b,`${panel}.querySelector('[aria-label="Show Brave usage"]')`,'all application summaries restored');
    await b.evaluate(`${panel}.querySelector('[aria-label="Show Brave usage"]').click()`);
    await waitUntil(b,`${panel}.querySelector('[data-event-id="${usageRows[1].eventId}"]')`,'Brave detail row');
    assert.equal(await b.evaluate(`${panel}.querySelector('[data-event-id="${usageRows[1].eventId}"] strong').textContent`),'Brave');
    await b.evaluate(`${panel}.querySelector('[aria-label="Application details"] button').click()`);
    await value(b,'Activity type','');await waitUntil(b,`${panel}.querySelectorAll('[aria-label="Endpoint activity timeline"] li').length===150 && ${contains('Older events remain stored.')}`,'all activity retained and result limit visible');
    await value(b,'Activity type','APPLICATION_USAGE');await waitUntil(b,`${panel}.querySelector('[aria-label="Show Notepad usage"]') && ${panel}.querySelector('[aria-label="Show Brave usage"]')`,'switch back to application summary view');
    assert.ok(network.some(r=>r.path==='/api/endpoint/dashboard'&&r.search.includes('eventType=APPLICATION_USAGE')&&r.status===200),'browser uses the server-side activity filter');
    assert.equal(await b.evaluate(`${panel}.textContent.includes('[object Object]')`),false);
    await b.evaluate("localStorage.setItem('zero_trust_token','expired-test-token')");await click(b,'Issue Enrollment Token');
    await waitUntil(b,"!document.querySelector('[aria-label=\"Installed endpoint agents\"]') && !localStorage.getItem('zero_trust_token')",'expired authentication returns to sign-in after refresh fails');
    assert.deepEqual(exceptions,[],'No browser JavaScript exceptions');
    assert.deepEqual(consoleErrors,[],'No browser console.error calls');
    assert.ok(network.some(r=>r.path==='/api/endpoint/assign'&&r.status===200));assert.ok(network.some(r=>r.path.endsWith('/enrollment-token')&&r.status===200));assert.ok(network.some(r=>r.path==='/api/devices'&&r.status===200));
    assert.ok(!network.some(r=>r.status===404||r.status===426),'No missing UI endpoints or HTTPS configuration failures');
    console.log('Real browser verified Assign, Issue Enrollment Token, Copy, both Refresh buttons, loading/errors, persisted assignments and token hashes. No JavaScript exceptions, unexpected 404s or 426s.');
  }finally{
    if(b)await b.close();if(sse){for(const res of sse.clients)res.end();clearInterval(sse.heartbeatInterval);}
    if(server)await new Promise(r=>server.close(r));await f.close();
    if(profile && path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});
  }
});
