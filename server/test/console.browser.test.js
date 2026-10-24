import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {browser,waitUntil} from './browser-tools.js';

test('console routes render with real company records; alerts open the selected incident', {timeout:180000}, async()=>{
 const f=await deviceFixture();let server,b,sse,profile;let failIncidents=false;
 try {
  const incident=await f.prisma.incident.create({data:{incidentId:'UI-REGRESSION',title:'Unusual download review',userId:f.employee.id,userEmail:f.employee.email,severity:'HIGH',status:'OPEN',riskScore:78,contributingFactors:['Download volume exceeded the approved baseline'],aiExplanation:'Recorded policy evidence for the isolated browser fixture.'}});
  const {default:api}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api/incidents',(req,res,next)=>{if(failIncidents&&req.method==='GET')return res.status(503).json({success:false,error:'Isolated test outage'});next();});app.use('/api',api);app.use(express.static(path.join(projectRoot,'client/dist')));app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const origin='http://127.0.0.1:'+server.address().port;
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-console-browser-'));b=await browser(profile);
  const exceptions=[],failed=[];
  b.listeners.push(m=>{if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Network.responseReceived'&&m.params.response.url.startsWith(origin+'/api/')&&m.params.response.status>=500&&!failIncidents)failed.push(new URL(m.params.response.url).pathname);});
  await b.command('Runtime.enable');await b.command('Network.enable');await b.command('Page.enable');
  await b.command('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
  const token=generateJwtToken(f.admin,true),user={...f.admin,passwordHash:undefined};
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(token)});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(user))});`});
  await b.command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  for(const route of ['incidents','alerts','risk-analysis','xai','ml-analytics','policies','devices','employees','departments','audit-logs','resources','access-requests','security-profile','settings','dashboard','employee-dashboard','simulator','admin-management']){
   console.log('Checking console route:',route);
   await b.command('Page.stopLoading');
   await b.command('Page.navigate',{url:origin+'/'+route});
   await waitUntil(b,`document.querySelector('.console-workspace[data-page="${route}"]')`,'console route '+route);
   await waitUntil(b,"document.querySelector('#cyberorbit-sidebar').textContent.includes('Device test administrator')",'authenticated actor');
   if(route==='dashboard'){
    await waitUntil(b,"document.querySelector('main')?.textContent.includes('Administrator Intelligence')",'administrator-only dashboard');
    const dashboardText=await b.evaluate("document.querySelector('main').innerText");
    assert.equal(dashboardText.includes(f.employee.name),false,'employee identity must not appear on administrator dashboard');
    assert.equal(dashboardText.includes('Unusual download review'),false,'employee incident must not appear on administrator dashboard');
    assert.equal(dashboardText.includes('No administrator activity available.'),true,'empty administrator-only sections show an explicit empty state');
    assert.equal(dashboardText.includes('Employee Intelligence'),false);
    assert.equal(dashboardText.includes('Administrator Intelligence'),true);
   }
   if(['incidents','alerts'].includes(route))await waitUntil(b,"document.querySelector('main')?.textContent.includes('Unusual download review')",'incident from PostgreSQL');
   assert.equal(await b.evaluate("document.body.textContent.includes('This page could not be displayed')"),false,route);
   if(['incidents','ml-analytics','dashboard'].includes(route)){
    if(route==='ml-analytics')await waitUntil(b,"document.querySelector('.model-summary')",'saved model report');
    await fs.mkdir(path.join(profile,'screenshots'),{recursive:true});
    const shot=await b.command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(profile,'screenshots/console-'+route+'.png'),Buffer.from(shot.data,'base64'));
   }
  }
  await b.command('Page.stopLoading');
  await b.command('Page.navigate',{url:origin+'/alerts'});
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Unusual download review')",'alerts list');
  await b.evaluate("Array.from(document.querySelectorAll('main tr')).find(x=>x.textContent.includes('Unusual download review')).querySelector('button').click()");
  await waitUntil(b,"Array.from(document.querySelectorAll('button')).some(x=>x.textContent==='Open incident')",'alert detail panel');
  await b.evaluate("Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='Open incident').click()");
  await waitUntil(b,"document.querySelector('.console-workspace[data-page=incidents]')",'alert investigation navigation');
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Recorded policy evidence for the isolated browser fixture.')",'selected incident evidence');
  assert.equal(await f.prisma.incident.count(),1,'Viewing incidents must not mutate records');
  await b.evaluate("(()=>{const e=document.querySelector('main textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Reviewed isolated browser fixture');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await b.evaluate("Array.from(document.querySelectorAll('main button')).find(x=>x.textContent.trim()==='RESOLVE & CLOSE').click()");
  await waitUntil(b,"!document.querySelector('main').textContent.includes('PROCESSING...') && document.querySelector('main').textContent.includes('RESOLVED')",'persisted incident resolution');
  const resolved=await f.prisma.incident.findUnique({where:{id:incident.id}});assert.equal(resolved.status,'RESOLVED');assert.equal(resolved.resolutionNotes,'Reviewed isolated browser fixture');
  failIncidents=true;
  await b.evaluate("Array.from(document.querySelectorAll('main button')).find(x=>x.textContent.trim()==='REFRESH').click()");
  await waitUntil(b,"document.querySelector('main').textContent.includes('Could not refresh: Incidents')",'visible refresh error');
  assert.equal(await b.evaluate("document.querySelector('main').textContent.includes('Unusual download review')"),true,'Retain stored records during outage');
  failIncidents=false;
  await b.evaluate("Array.from(document.querySelectorAll('main button')).find(x=>x.textContent.trim()==='REFRESH').click()");
  await waitUntil(b,"!document.querySelector('main').textContent.includes('Could not refresh: Incidents')",'refresh recovery');

  await b.command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await b.command('Page.stopLoading');
  await b.command('Page.navigate',{url:origin+'/incidents'});
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Unusual download review')",'mobile incident list');
  const shot=await b.command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(profile,'screenshots/console-mobile.png'),Buffer.from(shot.data,'base64'));
  assert.equal(await b.evaluate('document.documentElement.scrollWidth > window.innerWidth'),false,'No viewport horizontal overflow');
  assert.deepEqual(exceptions,[]);assert.deepEqual(failed,[]);
 } finally {
  if(b)await b.close();if(sse){for(const c of sse.clients)c.end();clearInterval(sse.heartbeatInterval);}if(server)await new Promise(r=>server.close(r));await f.close();
  if(profile&&path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});
 }
});
