import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import express from 'express';
import { snapshot } from '../src/collectors/windows.js';
import { normalize } from '../src/normalizer.js';
import { EncryptedQueue } from '../src/queue.js';
import { Transport, Uploader } from '../src/uploader.js';
import {EndpointService} from '../../server/services/endpoint-service.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
dotenv.config({path:path.join(root,'.env'),quiet:true});
test('real Windows observation -> authenticated HTTP -> durable PostgreSQL -> employee dashboard',{skip:process.platform!=='win32'||!process.env.DATABASE_URL,timeout:180000},async()=>{
  const schema=`orbit_agent_test_${randomBytes(8).toString('hex')}`;
  const base=new PrismaClient(), url=new URL(process.env.DATABASE_URL.replace(/^["']|["']$/g,''));
  url.searchParams.set('schema',schema);
  const client=new PrismaClient({datasources:{db:{url:url.toString()}}});
  let server,queueDir,sse;
  await base.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  try {
    for(const directory of (await fs.readdir(path.join(root,'prisma/migrations'))).filter(n=>/^\d/.test(n)).sort()) {
      const sql=await fs.readFile(path.join(root,'prisma/migrations',directory,'migration.sql'),'utf8');
      for(const statement of sql.split(';').map(s=>s.trim()).filter(s=>s.replace(/--[^\n]*/g,'').trim())) await client.$executeRawUnsafe(statement);
    }
    // Override only this isolated test process's Prisma client, never application state.
    global.__prismaClient=client;process.env.ENDPOINT_ALLOW_LOOPBACK_HTTP='true';process.env.JWT_SECRET=randomBytes(32).toString('hex');
    const {default:endpoint}=await import('../../server/routes/endpoint.js');
    const {default:eventsRouter}=await import('../../server/routes/events.js');
    const {generateJwtToken}=await import('../../server/middleware/auth.js');
    const {sseManager}=await import('../../server/services/sse.js');
    sse=sseManager;
    const app=express();app.use(express.json({limit:'256kb'}));app.use('/api/endpoint',endpoint);app.use('/api/events',eventsRouter);
    server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
    const origin=`http://127.0.0.1:${server.address().port}`;
    await client.role.createMany({data:[{code:'EMPLOYEE',name:'Employee'},{code:'SECURITY_ADMIN',name:'Security admin'}]});
    await client.department.create({data:{code:'ENGINEERING',name:'Engineering'}});
    const admin=await client.user.create({data:{employeeId:randomUUID(),email:`${randomUUID()}@test.invalid`,name:'Test admin',companyId:'A',roleCode:'SECURITY_ADMIN',isMainAdmin:true}});
    const employee=await client.user.create({data:{employeeId:randomUUID(),email:`${randomUUID()}@test.invalid`,name:'Assigned employee',companyId:'A'}});
    const other=await client.user.create({data:{employeeId:randomUUID(),email:`${randomUUID()}@test.invalid`,name:'Other company',companyId:'B',roleCode:'SECURITY_ADMIN'}});
    const otherEmployee=await client.user.create({data:{employeeId:randomUUID(),email:`${randomUUID()}@test.invalid`,name:'Other employee',companyId:'A'}});
    const call=async(route,user,method='GET',body)=> {
      const response=await fetch(`${origin}/api/endpoint/${route}`,{method,headers:{Authorization:`Bearer ${generateJwtToken(user,true)}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      return{status:response.status,data:await response.json()};
    };
    assert.equal((await fetch(`${origin}/api/events/stream`)).status,401);
    const streamSession=await fetch(`${origin}/api/events/stream-session`,{method:'POST',headers:{Authorization:`Bearer ${generateJwtToken(admin,true)}`}});assert.equal(streamSession.status,200);
    const controller=new AbortController();
    const stream=await fetch(`${origin}/api/events/stream`,{headers:{Cookie:streamSession.headers.get('set-cookie').split(';')[0]},signal:controller.signal});assert.equal(stream.status,200);
    const reader=stream.body.getReader();await reader.read();
    sseManager.broadcast('ENDPOINT_UPDATED',{companyId:'B',userId:employee.id});
    sseManager.broadcast('ENDPOINT_UPDATED',{companyId:'B',userId:otherEmployee.id});
    sseManager.broadcast('ENDPOINT_UPDATED',{companyId:'A',userId:employee.id});
    const live=new TextDecoder().decode((await reader.read()).value);
    assert.equal(live.split('ENDPOINT_UPDATED').length-1,1);assert.ok(!live.includes(otherEmployee.id));controller.abort();
    const observedProcess=(await snapshot({processes:true})).processes.find(p=>p.pid===process.pid);assert.ok(observedProcess?.identity,'Real OS owner SID required');
    const assignment=await call('assign',admin,'POST',{userId:employee.id,name:'Real Windows test laptop',platform:'win32',mappedIdentity:observedProcess.identity});assert.equal(assignment.status,200);
    const expired=await call('assign',admin,'POST',{userId:employee.id,name:'Expired enrollment',platform:'win32'});
    await client.endpointDevice.update({where:{id:expired.data.deviceId},data:{enrollmentExpiresAt:new Date(0)}});
    const transport=new Transport({serverUrl:origin,allowLoopbackHttp:true});
    await assert.rejects(transport.post('enroll',{token:expired.data.enrollmentToken,platform:'win32',agentVersion:'test'}),e=>e.status===401);
    const r=await transport.post('enroll',{token:assignment.data.enrollmentToken,platform:'win32',agentVersion:'test'});
    await assert.rejects(transport.post('enroll',{token:assignment.data.enrollmentToken,platform:'win32',agentVersion:'test'}),e=>e.status===401);
    const deviceTransport=new Transport({serverUrl:origin,allowLoopbackHttp:true},r.credential);
    queueDir=await fs.mkdtemp(path.join(root,'agent/test/.integration-'));
    const key=randomBytes(32).toString('base64'), q=await new EncryptedQueue(queueDir,key).init(), observation=normalize(r.deviceId,'PROCESS_RUNNING',observedProcess);
    await q.append(observation);let online=false;
    const flaky={post:async(...args)=>{if(!online)throw new Error('Offline network test');return deviceTransport.post(...args);}};
    const uploader=new Uploader(q,flaky);await uploader.tick();assert.equal(q.health().queueEvents,1);
    const recovered=await new EncryptedQueue(queueDir,key).init();assert.equal(recovered.health().queueEvents,1);
    online=true;const recoveredUploader=new Uploader(recovered,flaky);await recoveredUploader.tick();assert.equal(recovered.health().queueEvents,0);
    await deviceTransport.post('ingest',{events:[observation,observation]});assert.equal(await client.endpointEvent.count({where:{deviceId:r.deviceId}}),1);
    await deviceTransport.post('ingest',{events:[normalize(r.deviceId,'PROCESS_RUNNING',{...observedProcess,identity:'S-1-5-21-000-111-222-333'})]});
    // Current console accepts administrators only; service-level employee
    // attribution remains verified without weakening console authentication.
    assert.equal((await call('dashboard',employee)).status,401);
    const service=new EndpointService(client),personal=await service.dashboard(employee);
    assert.equal(personal.events.length,1);assert.equal(personal.events[0].userId,employee.id);
    const dash=await call(`dashboard?userId=${employee.id}`,admin);assert.equal(dash.status,200);assert.equal(dash.data.devices[0].userId,employee.id);assert.equal(dash.data.ml.available,false);
    assert.equal((await call('dashboard',other)).data.devices.length,0);
    await assert.rejects(service.dashboard(otherEmployee,employee.id),e=>e.status===403);
    assert.equal((await call(`${r.deviceId}/revoke`,other,'POST',{reason:'Cross-company revoke denial'})).status,404);
    assert.equal((await call(`${r.deviceId}/revoke`,admin,'POST',{reason:'Verified credential revocation'})).status,200);
    await assert.rejects(deviceTransport.post('ingest',{events:[observation]}),e=>e.status===401);
    console.log('Verified actual Windows process, enrollment, offline recovery, durable storage, employee dashboard, tenant boundaries, dedupe and revocation.');
    clearInterval(sseManager.heartbeatInterval);
  } finally {
    if(sse)clearInterval(sse.heartbeatInterval);
    if(server)await new Promise(r=>server.close(r));await client.$disconnect();
    if(!/^orbit_agent_test_[a-f0-9]{16}$/.test(schema))throw new Error('Unsafe test schema cleanup');
    await base.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);await base.$disconnect();
    if(queueDir && path.dirname(queueDir)===path.join(root,'agent','test'))await fs.rm(queueDir,{recursive:true,force:true});
  }
});
