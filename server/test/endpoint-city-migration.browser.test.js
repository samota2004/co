import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {EndpointService} from '../services/endpoint-service.js';
import {browser,waitUntil} from './browser-tools.js';
const hasBrowser=await fs.access(process.env.CYBERORBIT_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe').then(()=>true).catch(()=>false);
const panel='document.querySelector(\'[aria-label="Installed endpoint agents"]\')';
test('pending migration shows the existing two Windows/one Mac; load errors never claim empty observations',{skip:!process.env.DATABASE_URL||!hasBrowser,timeout:90000},async()=>{
  const f=await deviceFixture();let server,b,profile,sse,failDashboard=true;const exceptions=[];
  try {
    assert.match(new URL(f.url).searchParams.get('schema'),/^orbit_buttons_test_[a-f0-9]{16}$/);
    const service=new EndpointService(f.prisma),ids=[];
    for(const [name,platform,identity] of [['Existing Windows A','win32','S-1-5-21-111-222-333-1007'],['Existing Windows B','win32','S-1-5-21-111-222-333-1008'],['Existing Mac','darwin','uid:843']]) {
      const a=await service.assign(f.admin,{userId:f.employee.id,name,platform,mappedIdentity:identity});ids.push(a.deviceId);await service.enroll({token:a.enrollmentToken,platform,agentVersion:'1.1.0'});
    }
    await f.prisma.$executeRawUnsafe('ALTER TABLE endpoint_devices DROP COLUMN "ipCity"');
    await f.prisma.$executeRawUnsafe('ALTER TABLE endpoint_devices DROP COLUMN "ipCityEnabled"');
    await f.prisma.$executeRawUnsafe('ALTER TABLE endpoint_devices DROP COLUMN "ipCityGeneration"');
    const {default:api}=await import('../routes/index.js');const {generateJwtToken}=await import('../middleware/auth.js');
    const {db}=await import('../models/db.js');await db.initDatabaseLayer();sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api/endpoint/dashboard',(req,res,next)=>failDashboard?res.status(503).json({success:false,error:'Fixture database migration error'}):next());app.use('/api',api);app.use(express.static(path.join(projectRoot,'client/dist')));app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-city-migration-'));b=await browser(profile);
    b.listeners.push(m=>{if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});await b.command('Runtime.enable');await b.command('Page.enable');
    await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(generateJwtToken(f.admin,true))});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(f.admin))});`});
    await b.command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/devices`});
    await waitUntil(b,`${panel}?.textContent.includes('This does not mean devices were deleted')`,'honest initial load error');
    assert.equal(await b.evaluate(`${panel}.textContent.includes('No application-usage events were returned')`),false);
    assert.equal(await b.evaluate(`Array.from(${panel}.querySelectorAll('button')).find(e=>e.textContent==='Assign').matches(':disabled')`),true);
    failDashboard=false;await b.evaluate(`Array.from(${panel}.querySelectorAll('button')).find(e=>e.textContent==='Refresh').click()`);
    await waitUntil(b,`${panel}?.querySelectorAll('article').length===3 && !${panel}.textContent.includes('Fixture database migration error')`,'existing devices restored without reenrollment');
    for(const name of ['Existing Windows A','Existing Windows B','Existing Mac'])assert.equal(await b.evaluate(`${panel}.textContent.includes(${JSON.stringify(name)})`),true);
    assert.equal(await b.evaluate(`${panel}.querySelectorAll('[aria-label="Estimated device city"]').length`),3);
    assert.equal(await b.evaluate(`${panel}.textContent.includes('Existing devices and monitoring remain available')`),true);
    assert.equal(await b.evaluate(`Array.from(${panel}.querySelectorAll('button')).filter(e=>e.textContent==='Enable city estimate').every(e=>e.disabled)`),true);
    assert.deepEqual((await f.prisma.endpointDevice.findMany({select:{id:true}})).map(d=>d.id).sort(),ids.sort());assert.deepEqual(exceptions,[]);
  }finally{if(b)await b.close();if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));if(profile)await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});await f.close();}
});
