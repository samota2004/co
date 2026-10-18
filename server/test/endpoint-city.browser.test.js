import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {EndpointService} from '../services/endpoint-service.js';
import {browser,waitUntil} from './browser-tools.js';
const browserPath=process.env.CYBERORBIT_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const hasBrowser=await fs.access(browserPath).then(()=>true).catch(()=>false);
const cityPanel='document.querySelector(\'[aria-label="Estimated device city"]\')';
const health={queueEvents:0,queueBytes:0,droppedEvents:0,paused:false,helperLastSeen:null,collectors:{}};
test('unchanged agents on all three platforms show estimated city, timestamp, stale/error states and immediate disable',{skip:!process.env.DATABASE_URL||!hasBrowser,timeout:90000},async()=>{
  const f=await deviceFixture();let server,b,profile,sse;const exceptions=[];
  try {
    const service=new EndpointService(f.prisma,{lookup:async()=>({status:'available',source:'heartbeat-public-ip',provider:'ipapi.co',city:'Fixture Delhi',region:'Fixture Region',country:'India',countryCode:'IN',resolvedAt:new Date().toISOString()})});
    const {default:api}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const {db}=await import('../models/db.js');await db.initDatabaseLayer();sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api',api);app.use(express.static(path.join(projectRoot,'client/dist')));app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
    profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-city-browser-'));b=await browser(profile);
    b.listeners.push(m=>{if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);});
    await b.command('Runtime.enable');await b.command('Page.enable');
    await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(generateJwtToken(f.admin,true))});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(f.admin))});Object.defineProperty(navigator,'geolocation',{configurable:true,get(){throw new Error('Browser geolocation must not be used for heartbeat city estimates');}});`});
    for(const [platform,identity] of [['darwin','uid:843'],['win32','S-1-5-21-1234-5678-9012-1007'],['linux','uid:1943']]) {
      const a=await service.assign(f.admin,{userId:f.employee.id,name:`${platform} city fixture`,platform,mappedIdentity:identity});
      const e=await service.enroll({token:a.enrollmentToken,platform,agentVersion:'1.1.0'});
      await b.command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/devices`});
      await waitUntil(b,`document.querySelector('article [aria-label="Assigned device UUID"]')?.textContent===${JSON.stringify(a.deviceId)} && ${cityPanel}?.textContent.includes('City estimate is off')`,'assigned city card');
      const click=label=>b.evaluate(`Array.from(${cityPanel}.querySelectorAll('button')).find(e=>e.textContent===${JSON.stringify(label)}).click()`);
      await click('Enable city estimate');
      await waitUntil(b,`${cityPanel}?.textContent.includes('Waiting for the next authenticated laptop heartbeat')`,'old-agent heartbeat pending');
      assert.ok(await b.evaluate(`${cityPanel}.textContent.includes('no kit update')`));
      await service.heartbeat(e.credential,{agentVersion:'1.1.0',health},'8.8.8.8');
      await b.evaluate("window.dispatchEvent(new Event('cyberorbit-endpoint-updated'))");
      await waitUntil(b,`${cityPanel}?.textContent.includes('Fixture Delhi') && ${cityPanel}.textContent.includes('Recent network estimate') && ${cityPanel}.textContent.includes('Last updated:')`,'estimated city and timestamp');
      const saved=await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}}),old=new Date(Date.now()-10*60000);
      await f.prisma.endpointDevice.update({where:{id:a.deviceId},data:{lastSeen:old,ipCity:{...saved.ipCity,observedAt:old.toISOString()}}});
      await b.evaluate("window.dispatchEvent(new Event('cyberorbit-endpoint-updated'))");
      await waitUntil(b,`${cityPanel}?.textContent.includes('Last known estimate; not current')`,'stale estimate');
      await f.prisma.endpointDevice.update({where:{id:a.deviceId},data:{ipCity:{status:'provider-not-configured'}}});
      await b.evaluate("window.dispatchEvent(new Event('cyberorbit-endpoint-updated'))");
      await waitUntil(b,`${cityPanel}?.textContent.includes('Location API is not configured') && !${cityPanel}.textContent.includes('Fixture Delhi')`,'honest provider status');
      await click('Disable city estimate');
      await waitUntil(b,`${cityPanel}?.textContent.includes('City estimate is off')`,'disabled city');
      assert.deepEqual((await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}})).ipCity,{status:'disabled'});
    }
    assert.deepEqual(exceptions,[]);
  }finally{if(b)await b.close();if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));if(profile)await fs.rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});await f.close();}
});
