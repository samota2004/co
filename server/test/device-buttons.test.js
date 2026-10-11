import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { deviceFixture } from './device-fixture.js';
import { hashSecret } from '../services/endpoint-service.js';
import { requestApi } from '../../client/src/services/api.js';

test('Devices API helper preserves backend errors, authentication and truthful response handling',async t=>{
  const originalFetch=global.fetch, originalStorage=global.localStorage;
  t.after(()=>{global.fetch=originalFetch;global.localStorage=originalStorage;});
  global.localStorage={getItem:()=> 'test-jwt'};
  let options;
  global.fetch=async(url,o)=>{options=o;return new Response(JSON.stringify({success:false,error:{code:'UNAUTHORIZED',message:'Authentication required.'}}),{status:401});};
  await assert.rejects(requestApi('/api/endpoint/assign',{method:'POST',body:{userId:'x'}}),/Authentication required\./);
  assert.equal(options.headers.Authorization,'Bearer test-jwt');assert.equal(options.headers['Content-Type'],'application/json');
  global.fetch=async()=>new Response(JSON.stringify({success:false,error:'Device already enrolled'}),{status:409});
  await assert.rejects(requestApi('/api/endpoint/id/enrollment-token',{method:'POST',body:{}}),/Device already enrolled/);
  global.fetch=async()=>new Response('<html>wrong route</html>',{status:200});
  await assert.rejects(requestApi('/api/devices'),/HTTP 200/);
  global.fetch=async()=>{throw new TypeError('network failed');};await assert.rejects(requestApi('/api/devices'),/Cannot reach the backend/);
});

test('real assignment, token issuance and refresh routes persist state and enforce database/auth boundaries',{skip:!process.env.DATABASE_URL,timeout:60000},async()=>{
  const f=await deviceFixture();let server,sse;
  try {
    const {default:endpoint}=await import('../routes/endpoint.js'),{default:devices}=await import('../routes/devices.js');
    const {generateJwtToken}=await import('../middleware/auth.js');sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api/endpoint',endpoint);app.use('/api/devices',devices);
    server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});const origin=`http://127.0.0.1:${server.address().port}`;
    const call=async(path,user=f.admin,method='GET',body)=>{
      const response=await fetch(origin+path,{method,headers:{...(user?{Authorization:`Bearer ${generateJwtToken(user,true)}`} : {}),'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      return {status:response.status,data:await response.json(),headers:response.headers};
    };
    assert.equal((await call('/api/devices',null)).status,401);
    assert.equal((await call('/api/endpoint/assign',f.employee,'POST',{})).status,401);
    const values={userId:f.employee.id,name:'Assigned laptop',platform:'win32',issueEnrollmentToken:false};
    assert.equal((await call('/api/endpoint/assign',f.admin,'POST',{...values,userId:''})).status,400);
    assert.equal((await call('/api/endpoint/assign',f.admin,'POST',{...values,userId:f.foreign.id})).status,404);
    assert.equal((await call('/api/endpoint/assign',f.admin,'POST',{...values,userId:f.disabled.id})).status,404);
    const assigned=await call('/api/endpoint/assign',f.admin,'POST',values);assert.equal(assigned.status,200);assert.ok(!assigned.data.enrollmentToken);
    const id=assigned.data.deviceId;let stored=await f.prisma.endpointDevice.findUnique({where:{id}});assert.equal(stored.userId,f.employee.id);assert.equal(stored.enrollmentHash,null);
    assert.equal((await call('/api/endpoint/assign',f.admin,'POST',{...values,deviceId:randomUUID()})).status,404);
    assert.equal((await call('/api/endpoint/assign',f.otherAdmin,'POST',{...values,userId:f.foreign.id,deviceId:id})).status,404);
    assert.equal((await call('/api/endpoint/assign',f.admin,'POST',{...values,userId:f.employee2.id,deviceId:id})).status,200);
    stored=await f.prisma.endpointDevice.findUnique({where:{id}});assert.equal(stored.userId,f.employee2.id);assert.equal(await f.prisma.endpointDevice.count(),1);
    assert.equal((await call(`/api/endpoint/${id}/enrollment-token`,f.otherAdmin,'POST',{})).status,404);
    const issued=await call(`/api/endpoint/${id}/enrollment-token`,f.admin,'POST',{});assert.equal(issued.status,200);assert.equal(issued.headers.get('cache-control'),'no-store');
    stored=await f.prisma.endpointDevice.findUnique({where:{id}});assert.equal(stored.enrollmentHash,hashSecret(issued.data.enrollmentToken));assert.ok(Date.parse(issued.data.expiresAt)>Date.now());
    const newer=await call(`/api/endpoint/${id}/enrollment-token`,f.admin,'POST',{});assert.equal(newer.status,200);
    assert.equal((await call('/api/endpoint/enroll',null,'POST',{token:issued.data.enrollmentToken,platform:'win32',agentVersion:'test'})).status,401);
    const dashboard=await call('/api/endpoint/dashboard');assert.equal(dashboard.status,200);assert.equal(dashboard.data.devices[0].userId,f.employee2.id);assert.ok(!JSON.stringify(dashboard.data).includes(newer.data.enrollmentToken));assert.ok(!('enrollmentHash' in dashboard.data.devices[0]));
    assert.ok(dashboard.data.employees.every(u=>[f.employee.id,f.employee2.id].includes(u.id)));
    const enrolled=await call('/api/endpoint/enroll',null,'POST',{token:newer.data.enrollmentToken,platform:'win32',agentVersion:'test'});assert.equal(enrolled.status,200);
    assert.equal((await call(`/api/endpoint/${id}/enrollment-token`,f.admin,'POST',{})).status,409);
    assert.equal((await call('/api/endpoint/assign',f.admin,'POST',{...values,deviceId:id})).status,409);
    await f.prisma.device.create({data:{deviceId:randomUUID(),userId:f.employee.id,name:'Existing browser device',os:'Windows',browser:'Edge',ip:'127.0.0.1',location:'Test'}});
    const list=await call('/api/devices');assert.equal(list.status,200);assert.equal(list.data.devices.length,1);assert.equal(list.data.devices[0].deviceName,'Existing browser device');assert.ok(!list.data.users);
    assert.equal((await call('/api/devices',f.otherAdmin)).data.devices.length,0);
    assert.equal((await call('/api/devices',f.employee2)).status,401);
    process.env.ENDPOINT_ALLOW_LOOPBACK_HTTP='false';assert.equal((await call('/api/endpoint/dashboard')).status,426);process.env.ENDPOINT_ALLOW_LOOPBACK_HTTP='true';
    const oldEnvironment=process.env.NODE_ENV;process.env.NODE_ENV='production';assert.equal((await call('/api/endpoint/dashboard')).status,426);
    if(oldEnvironment===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldEnvironment;
  }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(r=>server.close(r));await f.close();}
});
