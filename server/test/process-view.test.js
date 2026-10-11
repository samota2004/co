import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {EndpointService} from '../services/endpoint-service.js';
test('process view filters before limit and keeps company scope',async()=>{
 const f=await deviceFixture();
 try{
 const service=new EndpointService(f.prisma);
 const d=await service.assign(f.admin,{userId:f.employee.id,name:'Process test',platform:'win32',issueEnrollmentToken:false});
 const other=await service.assign(f.admin,{userId:f.employee2.id,name:'Other employee device',platform:'win32',issueEnrollmentToken:false});
 const row=(type,companyId='A',age=0)=>({eventId:randomUUID(),deviceId:d.deviceId,userId:f.employee.id,companyId,version:1,type,occurredAt:new Date(Date.now()-age),metadata:{name:'fixture-app',pid:42,...(type==='APPLICATION_USAGE'?{durationSeconds:30}:{})}});
 await f.prisma.endpointEvent.createMany({data:[...Array.from({length:160},()=>row('APPLICATION_USAGE')),row('PROCESS_RUNNING','A',2000),row('PROCESS_START','A',3000),row('PROCESS_STOP','A',1000),row('PROCESS_RUNNING','B')]});
 const data=await service.dashboard(f.admin,f.employee.id,'PROCESS_ACTIVITY');
 assert.equal(data.events.length,3);assert.ok(data.events.every(e=>e.companyId==='A'&&e.type.startsWith('PROCESS_')));
 assert.equal(data.timeline.eventType,'PROCESS_ACTIVITY');assert.equal(data.timeline.hasMore,false);
 const usage=await service.dashboard(f.admin,f.employee.id,'APPLICATION_USAGE');assert.equal(usage.events.length,150);assert.ok(usage.events.every(e=>e.type==='APPLICATION_USAGE'));
 const selected=await service.dashboard(f.admin,f.employee.id,'PROCESS_ACTIVITY',d.deviceId);assert.ok(selected.events.every(e=>e.deviceId===d.deviceId));
 await assert.rejects(service.dashboard(f.employee,undefined,'PROCESS_ACTIVITY',other.deviceId),e=>e.status===404);
 await assert.rejects(service.dashboard(f.admin,undefined,'INVALID'));
 }finally{await f.close();}
});
