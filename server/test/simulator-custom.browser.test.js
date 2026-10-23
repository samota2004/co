import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {build} from 'vite';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {browser,waitUntil} from './browser-tools.js';

const browserPath=process.env.CYBERORBIT_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const hasBrowser=await fs.access(browserPath).then(()=>true).catch(()=>false);

test('custom simulator form submits to the validated synthetic assessment route',{skip:!hasBrowser,timeout:120000},async()=>{
 const f=await deviceFixture();let server,b,sse,profile;
 try{
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-simulator-browser-'));
  const clientBuild=path.join(profile,'client-dist'),nodeEnv=process.env.NODE_ENV;
  try{await build({configFile:path.join(projectRoot,'client/vite.config.js'),root:path.join(projectRoot,'client'),logLevel:'error',build:{outDir:clientBuild,emptyOutDir:true}});}
  finally{if(nodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=nodeEnv;}
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);app.use(express.static(clientBuild));app.get('*',(_,res)=>res.sendFile(path.join(clientBuild,'index.html')));
  server=await new Promise(resolve=>{const handle=app.listen(0,'127.0.0.1',()=>resolve(handle));});
  const origin=`http://127.0.0.1:${server.address().port}`,token=generateJwtToken(f.admin,true),safeAdmin={...f.admin,passwordHash:undefined};
  b=await browser(path.join(profile,'chrome-profile'));
  const requests=[],responses=[];
  b.listeners.push(message=>{
   if(message.method==='Network.requestWillBeSent'&&message.params.request.url.startsWith(`${origin}/api/`))requests.push({path:new URL(message.params.request.url).pathname,method:message.params.request.method});
   if(message.method==='Network.responseReceived'&&message.params.response.url.startsWith(`${origin}/api/`))responses.push({path:new URL(message.params.response.url).pathname,status:message.params.response.status});
  });
  await b.command('Runtime.enable');await b.command('Network.enable');await b.command('Page.enable');
  await b.command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(token)});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(safeAdmin))});`});
  await b.command('Page.navigate',{url:`${origin}/simulator`});
  await waitUntil(b,"document.querySelector('[aria-label=\"Scenario employee\"]')?.options.length>1 && document.querySelector('form button')?.disabled===true",'simulator loaded with employee options');
  await b.evaluate(`(()=>{const e=document.querySelector('[aria-label="Scenario employee"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(f.employee.id)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitUntil(b,"!document.querySelector('form button').disabled",'employee selected');
  await b.evaluate("Array.from(document.querySelectorAll('form button')).find(button=>button.textContent.includes('Assess synthetic event')).click()");
  await waitUntil(b,"document.querySelector('[role=\"status\"]')?.textContent.includes('Risk ')",'custom assessment result rendered');
  assert.ok(requests.some(request=>request.path==='/api/simulation/custom'&&request.method==='POST'));
  assert.ok(responses.some(response=>response.path==='/api/simulation/custom'&&response.status===200));
  assert.ok(!requests.some(request=>request.path==='/api/telemetry/ingest'),'custom simulation must not call generic model telemetry');
  const stored=(await f.prisma.activityEvent.findMany({where:{userId:f.employee.id,type:'FILE_DOWNLOAD'},orderBy:{timestamp:'desc'},take:5})).find(event=>event.metadata?.source==='synthetic-custom-scenario');
  assert.ok(stored,'custom form assessment was persisted through the simulation flow');
  assert.equal(stored.metadata.synthetic,true);assert.equal(stored.metadata.simulation,true);
 }finally{
  if(b)await b.close();if(sse){for(const client of sse.clients)client.end();clearInterval(sse.heartbeatInterval);}
  if(server)await new Promise(resolve=>server.close(resolve));await f.close();
  if(profile&&path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});
 }
});
