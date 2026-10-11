import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { normalize, desktopAppMetadata, desktopAppChanged, foregroundObserved } from '../src/normalizer.js';
import { EncryptedQueue } from '../src/queue.js';
import { Uploader } from '../src/uploader.js';
import { validateConfig, validateEvent } from '../shared/contract.js';
import { validateServerUrl, effectiveConfig } from '../src/config.js';
import { desktopSampleStatus } from '../src/health.js';
import { EndpointService, hashSecret } from '../../server/services/endpoint-service.js';
const key=()=>randomBytes(32).toString('base64');
const event=(id=randomUUID(),identity='S-1-5-21-111-222-333-1001')=>normalize(id,'PROCESS_START',{pid:1,name:'observed.exe',identity});
test('foreground transitions record first detection, app switches and resume without repeating every sample',()=>{
  const now=Date.now(),active={pid:9,name:'AnyApplication',sessionId:'1',idleMilliseconds:100,locked:false,time:now-2000};
  assert.equal(foregroundObserved(undefined,active,now),true);
  assert.equal(foregroundObserved(active,{...active},now),false);
  assert.equal(foregroundObserved(active,{...active,pid:10},now),true);
  assert.equal(foregroundObserved({...active,idleMilliseconds:60001},active,now),true);
  assert.equal(foregroundObserved({...active,locked:true},active,now),true);
  assert.equal(foregroundObserved({...active,time:now-6000},active,now),true);
  for(const sample of [{...active,locked:true},{...active,idleMilliseconds:60000},{...active,pid:0},{...active,name:''}])assert.equal(foregroundObserved(undefined,sample,now),false);
  assert.ok(normalize(randomUUID(),'APPLICATION_FOREGROUND',{pid:9,name:'AnyApplication',sessionId:'1'}));
});
test('hosted application identity survives normalization and splits usage by app ID',()=>{
  const sample={pid:20,name:'CalculatorApp',appName:'Calculator',appId:'Example.Calculator!App',hostName:'ApplicationFrameHost',identitySource:'windows-app-id'};
  const e=normalize(randomUUID(),'APPLICATION_USAGE',{pid:sample.pid,name:sample.name,sessionId:'1',durationSeconds:5,...desktopAppMetadata(sample)});
  assert.equal(e.metadata.appId,sample.appId);assert.equal(e.metadata.appName,'Calculator');
  assert.equal(e.metadata.hostName,'ApplicationFrameHost');
  assert.equal(desktopAppChanged(sample,{...sample,appId:'Example.Clock!App'}),true);
  assert.equal(desktopAppChanged(sample,{...sample}),false);
  assert.equal(desktopAppChanged(sample,{...sample,pid:21}),true);
  assert.deepEqual(desktopAppMetadata({appName:5,appId:[],identitySource:'guessed',contents:'private'}),{});
  assert.equal(desktopAppMetadata({appName:'a\nb'}).appName,'a b');
  assert.throws(()=>validateEvent({...e,metadata:{...e.metadata,identitySource:'guessed'}}));
});
test('browser titles are optional, bounded browser-only metadata with two configuration approvals',()=>{
  const metadata={pid:123,name:'chrome',sessionId:'1',durationSeconds:2};
  assert.ok(normalize(randomUUID(),'APPLICATION_USAGE',metadata));
  const e=normalize(randomUUID(),'APPLICATION_USAGE',{...metadata,browserTitle:'Example page - Google Chrome'});
  assert.equal(e.metadata.browserTitle,'Example page - Google Chrome');
  for(const m of [{...e.metadata,browserTitle:'x'.repeat(257)},{...e.metadata,name:'notepad'},{...e.metadata,browserTitle:'bad\nvalue'},{...e.metadata,url:'https://example.org'}]) assert.throws(()=>validateEvent({...e,metadata:m}));
  assert.equal(validateConfig({}).browserTitles,false);
  assert.throws(()=>validateConfig({browserTitles:'true'}));
  assert.equal(effectiveConfig({browserTitles:true},{locallyApprovedDirectories:[]}).browserTitles,false);
  assert.equal(effectiveConfig({browserTitles:false},{browserTitles:true,locallyApprovedDirectories:[]}).browserTitles,false);
  assert.equal(effectiveConfig({browserTitles:true},{browserTitles:true,locallyApprovedDirectories:[]}).browserTitles,process.platform==='win32');
});
test('contract rejects identity injection, contents, timestamps, unsupported types and unsafe URL',()=>{
  const e=event();assert.equal(validateEvent(e),e);
  for(const value of [{...e,userId:'forged'}, {...e,occurredAt:'2000-01-01T00:00:00Z'}, {...e,type:'FILE_READ'}, {...e,metadata:{password:'x'}}, {...e,occurredAt:new Date(Date.now()+600000).toISOString()}]) assert.throws(()=>validateEvent(value));
  for(const url of ['http://localhost:3000','http://example.com','https://a:b@example.com','https://example.com/path']) assert.throws(()=>validateServerUrl(url,true));
  assert.equal(validateServerUrl('http://127.0.0.1:3000',true),'http://127.0.0.1:3000');
  assert.throws(()=>validateConfig({pollSeconds:1}));assert.throws(()=>validateConfig({network:'yes'}));
  const dir=path.resolve('agent/local/approved');assert.deepEqual(effectiveConfig({approvedDirectories:[dir,path.resolve('other')]},{locallyApprovedDirectories:[dir]}).approvedDirectories,[dir]);
});
test('desktop health distinguishes a connected helper from eligible foreground usage',()=>{
  assert.match(desktopSampleStatus({locked:true,idleMilliseconds:0,name:'chrome'}),/session locked/);
  assert.match(desktopSampleStatus({locked:false,idleMilliseconds:60000,name:'chrome'}),/user idle/);
  assert.match(desktopSampleStatus({locked:false,idleMilliseconds:100,name:''}),/process unavailable/);
  assert.match(desktopSampleStatus({locked:false,idleMilliseconds:100,name:'chrome'}),/foreground sample active/);
});
test('encrypted queue recovers after restart, bounded overflow and partial acknowledgment',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-queue-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const k=key(), q=await new EncryptedQueue(directory,k,{maxEvents:2}).init(), events=[event(),event(),event()];
  for(const e of events) await q.append(e);
  assert.equal(q.health().droppedEvents,1);assert.equal(q.health().queueEvents,2);
  for(const f of await fs.readdir(directory)) assert.ok(!(await fs.readFile(path.join(directory,f))).includes(Buffer.from('observed.exe')));
  const recovered=await new EncryptedQueue(directory,k,{maxEvents:2}).init();assert.equal(recovered.health().droppedEvents,1);
  await recovered.acknowledge([events[1].eventId]);assert.deepEqual((await recovered.batch()).map(e=>e.eventId),[events[2].eventId]);
  assert.throws(()=>recovered.decrypt(Buffer.from('corrupt')));
});
test('offline retry retains events and deletes only acknowledged events',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-retry-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const q=await new EncryptedQueue(directory,key()).init(),e=event();await q.append(e);let connected=false;
  const uploader=new Uploader(q,{post:async()=>{if(!connected)throw new Error('offline');return{acceptedEventIds:[e.eventId]};}});
  await uploader.tick();assert.equal(q.health().queueEvents,1);assert.ok(uploader.nextAttempt>Date.now());
  connected=true;await uploader.tick(uploader.nextAttempt+1);assert.equal(q.health().queueEvents,0);
  await q.append(event());const revoked=new Uploader(q,{post:async()=>{const e=new Error();e.status=401;throw e;}});await revoked.tick();assert.equal(revoked.revoked,true);assert.equal(q.health().queueEvents,1);
});
// Transaction-aware in-memory adapter only for deterministic security boundary tests.
// Real PostgreSQL/OS flow is a separate integration suite, never represented by this adapter.
function memoryStore() {
  const users=[{id:'admin',companyId:'A',roleCode:'SECURITY_ADMIN',status:'ACTIVE'},{id:'employee',companyId:'A',roleCode:'EMPLOYEE',status:'ACTIVE'},{id:'other',companyId:'B',roleCode:'EMPLOYEE',status:'ACTIVE'}],devices=[],events=[];
  const matches=(x,w)=>Object.entries(w).every(([k,v])=>v && typeof v==='object' ? v.gt ? new Date(x[k])>v.gt : v.in ? v.in.includes(x[k]) : true : x[k]===v);
  const store={user:{findFirst:async({where})=>users.find(u=>matches(u,where))},endpointDevice:{
    create:async({data})=>{const d={id:randomUUID(),enrolledAt:null,revokedAt:null,...data};devices.push(d);return d;},
    findFirst:async({where})=>{const d=devices.find(d=>matches(d,where));return d?{...d,user:users.find(u=>u.id===d.userId)}:null;},
    updateMany:async({where,data})=>{const d=devices.filter(d=>matches(d,where));d.forEach(d=>Object.assign(d,data));return{count:d.length};}
  },endpointEvent:{createMany:async({data})=>{for(const d of data) if(!events.some(e=>e.deviceId===d.deviceId&&e.eventId===d.eventId)) events.push(d);}},$transaction:async f=>f(store)};
  return{store,users,devices,events};
}
test('enrollment expiry/reuse, company boundary, verified attribution, dedupe and revocation',async()=>{
  const m=memoryStore(),s=new EndpointService(m.store),admin=m.users[0];
  await assert.rejects(s.assign(admin,{userId:'other',name:'laptop',platform:'win32'}),e=>e.status===404);
  await assert.rejects(s.assign(m.users[1],{}),e=>e.status===403);
  const expired=await s.assign(admin,{userId:'employee',name:'expired',platform:'win32'});m.devices[0].enrollmentExpiresAt=new Date(0);
  await assert.rejects(s.enroll({token:expired.enrollmentToken,platform:'win32',agentVersion:'test'}),e=>e.status===401);
  const a=await s.assign(admin,{userId:'employee',name:'assigned',platform:'win32',mappedIdentity:'S-1-5-21-111-222-333-1001'});
  const r=await s.enroll({token:a.enrollmentToken,platform:'win32',agentVersion:'test'});
  await assert.rejects(s.enroll({token:a.enrollmentToken,platform:'win32',agentVersion:'test'}),e=>e.status===401);
  assert.equal(m.devices[1].credentialHash,hashSecret(r.credential));assert.notEqual(m.devices[1].credentialHash,r.credential);
  const e=event(r.deviceId);await s.ingest(r.credential,{events:[e,e]});assert.equal(m.events.length,1);assert.equal(m.events[0].userId,'employee');assert.equal(m.events[0].companyId,'A');
  await s.ingest(r.credential,{events:[event(r.deviceId,'S-1-5-21-999')]});assert.equal(m.events[1].userId,null);
  const usage=normalize(r.deviceId,'APPLICATION_USAGE',{identity:'S-1-5-21-111-222-333-1001',pid:3,name:'chrome',sessionId:'1',durationSeconds:10,browserTitle:'Example title'});
  await s.ingest(r.credential,{events:[usage]});
  assert.equal(m.events[2].metadata.browserTitle,'Example title');assert.equal(m.events[2].userId,'employee');assert.equal(m.events[2].companyId,'A');
  const foreground=normalize(r.deviceId,'APPLICATION_FOREGROUND',{identity:'S-1-5-21-111-222-333-1001',pid:3,name:'AnyApplication',sessionId:'1'});
  await s.ingest(r.credential,{events:[foreground]});assert.equal(m.events[3].userId,'employee');assert.equal(m.events[3].type,'APPLICATION_FOREGROUND');
  await assert.rejects(s.ingest(r.credential,{events:[event()]}),e=>e.status===403);
  await assert.rejects(s.change({...admin,companyId:'B'},r.deviceId,{},true),e=>e.status===404);
  await s.change(admin,r.deviceId,{},true);await assert.rejects(s.ingest(r.credential,{events:[e]}),e=>e.status===401);
});
