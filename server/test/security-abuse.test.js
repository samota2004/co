import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {deviceFixture} from './device-fixture.js';

test('HTTP limits, tokens, input errors and SQL-like identifiers fail safely',{timeout:60000},async()=>{
 const f=await deviceFixture();let server,sse;
 try{
  const {default:routes}=await import('../routes/index.js');
  const {securityHttp}=await import('../middleware/security-http.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  const {securityErrorHandler}=await import('../services/security-common.js');
  sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(securityHttp);app.use(express.json({limit:'256kb'}));app.use('/api',routes);app.use(securityErrorHandler);
  server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const url='http://127.0.0.1:'+server.address().port;
  const call=async(path,body,token=generateJwtToken(f.admin,true))=>{const r=await fetch(url+'/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,data:await r.json(),headers:r.headers};};
  assert.equal((await call('/users',undefined,'invalid-token')).status,401);
  assert.equal((await call('/users',undefined,generateJwtToken(f.employee,false))).status,401);
  assert.equal((await call('/policies',undefined,generateJwtToken(f.employee,false))).status,401);
  const injection="' OR 1=1; DROP TABLE users; --";
  assert.equal((await call('/users/'+encodeURIComponent(injection))).status,404);
  assert.equal(await f.prisma.user.count(),6);
  const bad=await call('/resources',{name:'Invalid department type',departmentCode:{unexpected:true}});
  assert.equal(bad.status,400);assert.equal(bad.data.error.code,'INVALID_INPUT');assert.ok(bad.data.error.requestId);
  assert.equal(JSON.stringify(bad.data).includes('prisma.'),false);
  const oversized=await call('/resources',{name:'Oversized fixture',departmentCode:'ENGINEERING',description:'x'.repeat(270000)});assert.equal(oversized.status,413);
  const malformed=await fetch(url+'/api/resources',{method:'POST',headers:{Authorization:'Bearer '+generateJwtToken(f.admin,true),'Content-Type':'application/json'},body:'{"invalid":'});assert.equal(malformed.status,400);
  let limited;for(let i=0;i<16;i++)limited=await call('/auth/login',{});
  assert.equal(limited.status,429);assert.equal(limited.data.error.code,'RATE_LIMITED');assert.equal(limited.headers.get('retry-after'),'60');
 }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(r=>server.close(r));await f.close();}
});
