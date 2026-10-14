import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {EndpointService} from '../services/endpoint-service.js';
import {expireMacBrowserTitles} from '../services/endpoint-retention.js';
import {Transport,Uploader} from '../../agent/src/uploader.js';
import {EncryptedQueue} from '../../agent/src/queue.js';
import {normalize} from '../../agent/src/normalizer.js';

test('macOS contract over real HTTP/PostgreSQL: assignment guards, heartbeat, offline replay, attribution, retention and revocation', {skip:!process.env.DATABASE_URL,timeout:90000},async()=>{
  const f=await deviceFixture();let server,sse,directory;
  try {
    const {default:router}=await import('../routes/endpoint.js');sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use(express.json());app.use('/api/endpoint',router);
    server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
    const config={serverUrl:`http://127.0.0.1:${server.address().port}`,allowLoopbackHttp:true};
    const service=new EndpointService(f.prisma),identity='uid:724';
    const a=await service.assign(f.admin,{userId:f.employee.id,name:'Mac test fixture',platform:'darwin',mappedIdentity:identity});
    const transport=new Transport(config),request={token:a.enrollmentToken,platform:'darwin',agentVersion:'1.2.0',mappedIdentity:identity,expectedDeviceId:a.deviceId};
    for(const wrong of [{...request,mappedIdentity:'uid:501'},{...request,expectedDeviceId:randomUUID()}])await assert.rejects(transport.post('enroll',wrong),e=>e.status===409 && e.code==='ENROLLMENT_IDENTITY_MISMATCH');
    const r=await transport.post('enroll',request);assert.equal(r.mappedIdentity,identity);
    await assert.rejects(transport.post('enroll',request),e=>e.status===401);
    const device=new Transport(config,r.credential),health={queueEvents:0,queueBytes:0,droppedEvents:0,paused:false,helperLastSeen:null,collectors:{accountControl:'unsupported: user mode cannot change OS accounts',browserTitles:'unavailable: grant Accessibility to desktop helper'}};
    await device.post('heartbeat',{agentVersion:'1.2.0',health});
    const saved=await f.prisma.endpointDevice.findUnique({where:{id:a.deviceId}});assert.ok(saved.lastSeen);assert.deepEqual(saved.health,health);
    directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-mac-contract-'));const key=randomBytes(32).toString('base64');
    let q=await new EncryptedQueue(directory,key).init();
    const events=[normalize(a.deviceId,'APPLICATION_FOREGROUND',{identity,pid:42,name:'Google Chrome',appId:'com.google.Chrome',sessionId:'desktop:724'}),
      normalize(a.deviceId,'APPLICATION_USAGE',{identity,pid:42,name:'Google Chrome',appId:'com.google.Chrome',sessionId:'desktop:724',durationSeconds:4,browserTitle:'Public fixture'}),
      normalize(a.deviceId,'PROCESS_START',{identity,pid:43,name:'TextEdit'}),normalize(a.deviceId,'SESSION_LOCK',{identity,sessionId:'desktop:724',state:'locked'}),
      normalize(a.deviceId,'FILE_CHANGE',{identity,directory:'/Users/test-fixture/approved',relativePath:'fixture.txt',change:'rename'})];
    for(const event of events)await q.append(event);
    let online=false;const link={post:async(...args)=>{if(!online)throw new Error('offline');return device.post(...args);}};
    await new Uploader(q,link).tick();assert.equal(q.health().queueEvents,5);
    q=await new EncryptedQueue(directory,key).init();online=true;await new Uploader(q,link).tick();assert.equal(q.health().queueEvents,0);
    await device.post('ingest',{events});assert.equal(await f.prisma.endpointEvent.count({where:{deviceId:a.deviceId}}),5);
    const records=await f.prisma.endpointEvent.findMany({where:{deviceId:a.deviceId}});assert.ok(records.every(e=>e.userId===f.employee.id));
    const {generateJwtToken}=await import('../middleware/auth.js');
    const dashboard=await fetch(`${config.serverUrl}/api/endpoint/dashboard?deviceId=${a.deviceId}`,{headers:{Authorization:`Bearer ${generateJwtToken(f.admin,true)}`}});
    assert.equal(dashboard.status,200);const view=await dashboard.json();
    assert.equal(view.devices[0].connectionStatus,'CONNECTED');assert.equal(view.events.length,5);assert.equal(view.devices[0].agentVersion,'1.2.0');
    await assert.rejects(service.dashboard(f.otherAdmin,undefined,undefined,a.deviceId),e=>e.status===404);
    await f.prisma.endpointEvent.updateMany({where:{deviceId:a.deviceId,type:'APPLICATION_USAGE'},data:{occurredAt:new Date(Date.now()-8*86400000)}});
    await expireMacBrowserTitles(f.prisma);
    const old=await f.prisma.endpointEvent.findFirst({where:{deviceId:a.deviceId,type:'APPLICATION_USAGE'}});assert.equal(old.metadata.browserTitle,undefined);assert.equal(old.metadata.durationSeconds,4);
    await service.change(f.admin,a.deviceId,{},true);
    await assert.rejects(device.post('heartbeat',{agentVersion:'1.2.0',health}),e=>e.status===401);
    await q.append(events[0]);const revoked=new Uploader(q,device);await revoked.tick();assert.equal(revoked.revoked,true);assert.equal(q.health().queueEvents,1);
  } finally {
    if(server)await new Promise(r=>server.close(r));sse?.close?.();if(sse?.heartbeatInterval)clearInterval(sse.heartbeatInterval);
    if(directory)await fs.rm(directory,{recursive:true,force:true});await f.close();
  }
});
