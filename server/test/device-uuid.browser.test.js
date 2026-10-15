import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {EndpointService,hashSecret} from '../services/endpoint-service.js';
import {browser,waitUntil} from './browser-tools.js';

const browserPath=process.env.CYBERORBIT_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const hasBrowser=await fs.access(browserPath).then(()=>true).catch(()=>false);
const panel='document.querySelector(\'[aria-label="Installed endpoint agents"]\')';
const selected=`${panel}.querySelector('[aria-label="Selected device assignment"]')`;
const enrollment=`${panel}.querySelector('[aria-label="Enrollment details"]')`;
const uuid=root=>`${root}.querySelector('[aria-label="Assigned device UUID"]').textContent`;
const click=(b,label,root=panel)=>b.evaluate(`Array.from(${root}.querySelectorAll('button')).find(button=>button.textContent.trim()===${JSON.stringify(label)}).click()`);
const value=(b,label,text)=>b.evaluate(`(()=>{const e=${panel}.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);

test('Devices copies the assigned endpoint UUID separately from tokens without changing enrollment or scope',{skip:!process.env.DATABASE_URL || !hasBrowser,timeout:120000},async()=>{
  const f=await deviceFixture();let b,server,profile,sse,failDashboard=false;const exceptions=[],mutations=[];
  try {
    const service=new EndpointService(f.prisma);
    const a=await service.assign(f.admin,{userId:f.employee.id,name:'Employee Mac A',platform:'darwin',mappedIdentity:'uid:724',issueEnrollmentToken:false});
    const second=await service.assign(f.admin,{userId:f.employee2.id,name:'Employee Mac B',platform:'darwin',mappedIdentity:'uid:913',issueEnrollmentToken:false});
    const {default:api}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const {db}=await import('../models/db.js');await db.initDatabaseLayer();
    sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());
    app.use('/api/endpoint',(req,res,next)=>{
      if(req.method!=='GET')mutations.push(req.method+' '+req.path);
      if(failDashboard && req.path==='/dashboard')return res.status(503).json({success:false,error:'Fixture dashboard refresh unavailable'});
      next();
    });
    app.use('/api',api);app.use(express.static(path.join(projectRoot,'client/dist')));
    app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));
    server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});
    const origin=`http://127.0.0.1:${server.address().port}`;
    profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-device-uuid-'));b=await browser(profile);
    b.listeners.push(m=>{if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});
    await b.command('Runtime.enable');await b.command('Page.enable');
    // Browser clipboard behavior is controlled explicitly; all device/token
    // state still comes from the actual API and isolated PostgreSQL schema.
    await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`
      localStorage.setItem('zero_trust_token',${JSON.stringify(generateJwtToken(f.admin,true))});
      localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(f.admin))});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{
        if(window.__denyClipboard)throw new Error('Clipboard denied');window.__copied=text;
      }}});
    `});
    await b.command('Page.navigate',{url:origin+'/devices'});
    await waitUntil(b,`${panel} && ${panel}.querySelectorAll('article').length===2 && ${panel}.getAttribute('aria-busy')==='false'`,'assigned Macs');
    const snapshot=await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}}),before=mutations.length;
    const card=`Array.from(${panel}.querySelectorAll('article')).find(card=>card.querySelector('[aria-label="Assigned device UUID"]').textContent===${JSON.stringify(a.deviceId)})`;
    await click(b,'Copy Device UUID',card);
    await waitUntil(b,`window.__copied===${JSON.stringify(a.deviceId)}`,'device-card UUID clipboard');
    assert.deepEqual(await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}}),snapshot);
    assert.equal(mutations.length,before,'Copy must not assign a device or issue/consume a token');
    await value(b,'Device',a.deviceId);
    assert.equal(await b.evaluate(uuid(selected)),a.deviceId);
    await click(b,'Copy Device UUID',selected);await waitUntil(b,`${selected}.textContent.includes('Device UUID copied.')`,'selected UUID success');
    await click(b,'Issue Enrollment Token');
    await waitUntil(b,`${enrollment} && ${enrollment}.querySelector('[aria-label="Enrollment token"]')`,'separate UUID and token panel');
    const token=await b.evaluate(`${enrollment}.querySelector('[aria-label="Enrollment token"]').textContent`);
    assert.equal(await b.evaluate(uuid(enrollment)),a.deviceId);assert.notEqual(token,a.deviceId);assert.match(token,/^[A-Za-z0-9_-]{43}$/);
    const issued=await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}}),issuedMutations=mutations.length;
    assert.equal(issued.enrollmentHash,hashSecret(token));assert.equal(issued.enrolledAt,null);assert.equal(issued.mappedIdentity,'uid:724');
    await click(b,'Copy Device UUID',enrollment);await waitUntil(b,`window.__copied===${JSON.stringify(a.deviceId)}`,'UUID never copies the token');
    await click(b,'Copy token',enrollment);await waitUntil(b,`window.__copied===${JSON.stringify(token)}`,'token copied separately');
    assert.equal(mutations.length,issuedMutations);assert.deepEqual(await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}}),issued);
    await value(b,'Device',second.deviceId);
    assert.equal(await b.evaluate(`Boolean(${enrollment})`),false,'Changing devices removes the previous token');
    assert.equal(await b.evaluate(uuid(selected)),second.deviceId);
    await b.evaluate('window.__denyClipboard=true');await click(b,'Copy Device UUID',selected);
    await waitUntil(b,`${selected}.textContent.includes('copy the displayed device UUID manually')`,'honest clipboard failure');
    assert.equal(await b.evaluate(`${selected}.textContent.includes('Device UUID copied.')`),false);
    assert.equal(await b.evaluate(uuid(selected)),second.deviceId,'UUID stays selectable after clipboard denial');
    // A successful assignment must expose its saved UUID even if its subsequent
    // dashboard refresh fails. It must not create a replacement assignment.
    await value(b,'Device','');await value(b,'Employee',f.employee.id);await value(b,'Laptop name','New employee Mac');
    await value(b,'Platform','darwin');await value(b,'Verified OS identity','uid:724');failDashboard=true;
    await click(b,'Assign');await waitUntil(b,`${selected} && ${selected}.textContent.includes('New employee Mac') && ${panel}.textContent.includes('Fixture dashboard refresh unavailable')`,'new UUID before dashboard recovery');
    const saved=await f.prisma.endpointDevice.findFirst({where:{name:'New employee Mac'}});
    assert.equal(await b.evaluate(uuid(selected)),saved.id);assert.equal(saved.enrollmentHash,null);assert.equal(saved.userId,f.employee.id);
    failDashboard=false;
    const dashboard=async user=>fetch(origin+'/api/endpoint/dashboard',{headers:{Authorization:`Bearer ${generateJwtToken(user,true)}`}});
    const foreign=await dashboard(f.otherAdmin);assert.equal(foreign.status,200);assert.deepEqual((await foreign.json()).devices,[]);
    assert.equal((await dashboard(f.employee)).status,401);
    assert.deepEqual(exceptions,[]);
  } finally {
    if(b)await b.close();if(sse){for(const res of sse.clients)res.end();clearInterval(sse.heartbeatInterval);}
    if(server)await new Promise(resolve=>server.close(resolve));await f.close();
    if(profile && path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});
  }
});
