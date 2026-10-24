import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture,projectRoot} from './device-fixture.js';
import {browser,waitUntil} from './browser-tools.js';
import {DEFAULT_CONFIG} from '../../agent/shared/contract.js';

test('Employee Monitoring starts with the employee list, isolates selections, and shows endpoint empty state', {skip:!process.env.DATABASE_URL,timeout:180000}, async()=>{
 const f=await deviceFixture();let server,b,sse,profile;
 try{
  const nine=await f.prisma.user.update({where:{id:f.employee.id},data:{name:'Nine',employeeId:'EMP-NINE',email:'nine@test.invalid',departmentCode:'ENGINEERING',assignedAdminId:f.admin.id}});
  const priyanka=await f.prisma.user.update({where:{id:f.employee2.id},data:{name:'Priyanka',employeeId:'EMP-PRIYANKA',email:'priyanka@test.invalid',departmentCode:'ENGINEERING',assignedAdminId:f.admin.id}});
  const agent=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:nine.id,name:'Nine test endpoint',platform:'win32',agentVersion:'test-fixture',lastSeen:new Date(),health:{queueEvents:0,queueBytes:0,collectors:{desktop:'test fixture'}},config:DEFAULT_CONFIG}});
  await f.prisma.endpointEvent.create({data:{eventId:randomUUID(),deviceId:agent.id,companyId:'A',userId:nine.id,version:1,type:'APPLICATION_USAGE',occurredAt:new Date(),metadata:{name:'Synthetic editor fixture',durationSeconds:35}}});
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);app.use(express.static(path.join(projectRoot,'client/dist')));app.get('*',(req,res)=>res.sendFile(path.join(projectRoot,'client/dist/index.html')));
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  profile=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-employee-monitor-'));b=await browser(profile);
  const errors=[],apiRequests=[];b.listeners.push(message=>{if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);if(message.method==='Network.requestWillBeSent'&&message.params.request.url.includes('/api/users/'))apiRequests.push(new URL(message.params.request.url).pathname);});
  await b.command('Runtime.enable');await b.command('Page.enable');await b.command('Network.enable');
  const token=generateJwtToken(f.admin,true),user={...f.admin,passwordHash:undefined};
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('zero_trust_token',${JSON.stringify(token)});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify(user))});`});
  const origin='http://127.0.0.1:'+server.address().port;
  await b.command('Page.navigate',{url:origin+'/security-profile'});
  await waitUntil(b,"document.querySelector('.console-workspace[data-page=\"security-profile\"]') && document.querySelector('main')?.textContent.includes('Employee List') && document.querySelector('main')?.textContent.includes('Nine')",'employee list shown before selection');
  let body=await b.evaluate('document.querySelector("main").innerText');
  assert.equal(body.includes(f.admin.name),false,'admin identity is not presented as the selected employee');
  assert.equal(body.includes('No endpoint agent assigned to this employee.'),false,'no employee detail is loaded before selection');
  assert.equal(apiRequests.some(path=>path===`/api/users/${f.admin.id}/monitoring`),false,'admin identity is never requested as monitoring target');
  await b.evaluate("Array.from(document.querySelectorAll('tr[aria-label]')).find(row=>row.getAttribute('aria-label')==='View Nine').click()");
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Nine · EMP-NINE') && document.querySelector('main')?.textContent.includes('Synthetic editor fixture')",'Nine details and only Nine endpoint event');
  assert.ok(apiRequests.includes(`/api/users/${nine.id}/monitoring`),'selection requests the explicit employee ID');
  body=await b.evaluate('document.querySelector("main").innerText');
  assert.equal(body.includes('Priyanka'),false,'Nine detail view excludes Priyanka');
  assert.equal(body.includes(f.admin.name),false,'Nine detail view excludes administrator details');
  await b.evaluate("Array.from(document.querySelectorAll('main button')).find(button=>button.textContent.trim()==='Employee List').click()");
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Employee List') && !document.querySelector('main')?.textContent.includes('Nine · EMP-NINE')",'return to employee list');
  await b.evaluate("Array.from(document.querySelectorAll('tr[aria-label]')).find(row=>row.getAttribute('aria-label')==='View Priyanka').click()");
  await waitUntil(b,"document.querySelector('main')?.textContent.includes('Priyanka · EMP-PRIYANKA') && document.querySelector('main')?.textContent.includes('No endpoint agent assigned to this employee.')",'Priyanka detail and endpoint empty state');
  body=await b.evaluate('document.querySelector("main").innerText');
  assert.equal(body.includes('Nine · EMP-NINE'),false,'Priyanka detail view excludes Nine');
  assert.equal(body.includes('Synthetic editor fixture'),false,'Priyanka has no endpoint events');
  assert.deepEqual(errors,[]);
 }finally{
  if(b)await b.close();if(server)await new Promise(resolve=>server.close(resolve));
  if(sse){for(const client of sse.clients)client.end();clearInterval(sse.heartbeatInterval);}
  await f.close();if(profile&&path.dirname(profile)===os.tmpdir())await fs.rm(profile,{recursive:true,force:true,maxRetries:20,retryDelay:250});
 }
});
