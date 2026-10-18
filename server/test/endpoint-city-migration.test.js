import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {PrismaClient} from '../models/prisma.js';
import {EndpointService} from '../services/endpoint-service.js';
import {coreDeviceSelect,citySchemaReady,withCitySchema} from '../services/endpoint-city-schema.js';
import {expireCityEstimates} from '../services/endpoint-retention.js';
const health={queueEvents:0,queueBytes:0,droppedEvents:0,paused:false,helperLastSeen:null,collectors:{}};

test('schema fallback retries only missing optional city columns, never core schema or database failures',async()=>{
  const db={$queryRaw:async()=>[{present:3}]},calls=[];
  assert.equal(await withCitySchema(db,async ready=>{calls.push(ready);if(ready)throw {code:'P2022',meta:{column:'endpoint_devices.ipCity'}};return 'existing devices';}),'existing devices');
  assert.deepEqual(calls,[true,false]);
  const coreError={code:'P2022',meta:{column:'endpoint_devices.mappedIdentity'}};
  await assert.rejects(withCitySchema({$queryRaw:async()=>[{present:3}]},async()=>{throw coreError;}),e=>e===coreError);
  const offline={code:'P1001'};await assert.rejects(withCitySchema({$queryRaw:async()=>{throw offline;}},async()=>null),e=>e===offline);
});

test('two Windows and one Mac remain visible/enrolled and keep uploading before and after the city migration',{skip:!process.env.DATABASE_URL,timeout:90000},async()=>{
  const f=await deviceFixture();let server,sse,cold;
  try {
    // All schema changes below affect only this disposable test namespace.
    assert.match(new URL(f.url).searchParams.get('schema'),/^orbit_buttons_test_[a-f0-9]{16}$/);
    let lookups=0;
    const service=new EndpointService(f.prisma,{lookup:async()=>{lookups++;throw new Error('No lookup before optional migration');}}),records=[];
    for(const [name,platform,identity] of [['Windows fixture A','win32','S-1-5-21-111-222-333-1007'],['Windows fixture B','win32','S-1-5-21-111-222-333-1008'],['Mac fixture','darwin','uid:843']]) {
      const assigned=await service.assign(f.admin,{userId:f.employee.id,name,platform,mappedIdentity:identity});
      const enrolled=await service.enroll({token:assigned.enrollmentToken,platform,agentVersion:'1.1.0'});records.push({assigned,enrolled});
    }
    const before=await f.prisma.endpointDevice.findMany({select:coreDeviceSelect,orderBy:{id:'asc'}});
    assert.equal((await service.dashboard(f.admin)).devices.length,3); // Warm readiness cache.
    await f.prisma.$executeRawUnsafe('ALTER TABLE endpoint_devices DROP COLUMN "ipCity"');
    // The cached-ready transaction must roll back its missing-column failure,
    // then retry the normal heartbeat without optional city fields.
    const first=records[0];await service.heartbeat(first.enrolled.credential,{agentVersion:'1.1.0',health},'8.8.8.8');
    await f.prisma.$executeRawUnsafe('ALTER TABLE endpoint_devices DROP COLUMN "ipCityEnabled"');
    await f.prisma.$executeRawUnsafe('ALTER TABLE endpoint_devices DROP COLUMN "ipCityGeneration"');
    cold=new PrismaClient({datasources:{db:{url:f.url}}});assert.equal(await citySchemaReady(cold),false);
    assert.equal((await new EndpointService(cold).dashboard(f.admin)).devices.length,3);
    const dashboard=await service.dashboard(f.admin);
    assert.deepEqual(dashboard.devices.map(d=>d.id).sort(),records.map(r=>r.assigned.deviceId).sort());
    assert.ok(dashboard.devices.every(d=>d.ipCity.status==='migration-required'&&d.ipCitySchemaReady===false));
    assert.equal(dashboard.employees.length,2);assert.equal((await service.dashboard(f.otherAdmin)).devices.length,0);
    await assert.rejects(service.changeCity(f.admin,first.assigned.deviceId,{enabled:true}),e=>e.status===503&&e.code==='CITY_MIGRATION_REQUIRED');
    assert.equal(await expireCityEstimates(f.prisma),0);
    await service.change(f.admin,first.assigned.deviceId,{config:{...before[0].config,paused:true}});
    await service.change(f.admin,first.assigned.deviceId,{config:before[0].config});

    const {default:router}=await import('../routes/endpoint.js');sse=(await import('../services/sse.js')).sseManager;
    const {generateJwtToken}=await import('../middleware/auth.js');
    const app=express();app.use(express.json());app.use('/api/endpoint',router);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin=`http://127.0.0.1:${server.address().port}`;
    const post=async(route,credential,body)=>{const r=await fetch(origin+'/api/endpoint/'+route,{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
    for(const {enrolled} of records)assert.equal((await post('heartbeat',enrolled.credential,{agentVersion:'1.1.0',health})).status,200);
    const event={version:1,eventId:randomUUID(),deviceId:first.assigned.deviceId,occurredAt:new Date().toISOString(),type:'APPLICATION_USAGE',metadata:{pid:42,name:'Fixture application',sessionId:'1',durationSeconds:2,identity:'S-1-5-21-111-222-333-1007'}};
    assert.equal((await post('ingest',first.enrolled.credential,{events:[event]})).status,200);
    assert.equal((await post('heartbeat','invalid',{agentVersion:'1.1.0',health})).status,401);
    const response=await fetch(origin+'/api/endpoint/dashboard?eventType=APPLICATION_USAGE',{headers:{Authorization:`Bearer ${generateJwtToken(f.admin,true)}`}});
    assert.equal(response.status,200);const live=await response.json();assert.equal(live.devices.length,3);assert.equal(live.events[0].eventId,event.eventId);
    const after=await f.prisma.endpointDevice.findMany({select:coreDeviceSelect,orderBy:{id:'asc'}});
    for(let i=0;i<before.length;i++)for(const key of ['id','name','platform','userId','companyId','mappedIdentity','credentialHash','enrolledAt'])assert.deepEqual(after[i][key],before[i][key],`Preserve ${key}`);
    // New enrollments and revocation also remain available with the old schema.
    const fresh=await service.assign(f.admin,{userId:f.employee2.id,name:'Pending migration enrollment',platform:'win32',issueEnrollmentToken:false});
    const token=await service.issueEnrollmentToken(f.admin,fresh.deviceId);
    const exchanged=await service.enroll({token:token.enrollmentToken,platform:'win32',agentVersion:'1.1.0'});
    await service.change(f.admin,fresh.deviceId,{},true);await assert.rejects(service.heartbeat(exchanged.credential,{agentVersion:'1.1.0',health}),{status:401});
    assert.equal(lookups,0);
    // Apply the real additive migration SQL in place. No reset, reseed or ID/
    // credential changes are needed to restore the optional feature.
    const sql=await fs.readFile(new URL('../../prisma/migrations/20261018120000_endpoint_city_estimate/migration.sql',import.meta.url),'utf8');
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await f.prisma.$executeRawUnsafe(statement);
    await cold.$disconnect();cold=new PrismaClient({datasources:{db:{url:f.url}}});
    const restored=await new EndpointService(cold).dashboard(f.admin);assert.equal(restored.devices.length,4);assert.ok(restored.devices.every(d=>d.ipCitySchemaReady));
    for(const original of before){const row=await cold.endpointDevice.findUnique({where:{id:original.id}});assert.equal(row.credentialHash,original.credentialHash);assert.equal(row.mappedIdentity,original.mappedIdentity);}
  }finally{if(server)await new Promise(resolve=>server.close(resolve));if(sse)clearInterval(sse.heartbeatInterval);if(cold)await cold.$disconnect();await f.close();}
});
