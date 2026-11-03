import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {EndpointError,EndpointService,hashSecret} from '../services/endpoint-service.js';

test('authenticated USB connection creates one scoped admin notification without claiming data transfer',async()=>{
  const f=await deviceFixture();
  try{
    await f.prisma.user.update({where:{id:f.employee.id},data:{assignedAdminId:f.admin.id}});
    const credential=randomBytes(32).toString('base64url');
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic USB alert endpoint',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),config:{paused:false}}});
    const event={version:1,eventId:randomUUID(),deviceId:device.id,type:'USB_CONNECTED',occurredAt:new Date().toISOString(),metadata:{hardwareId:'synthetic-hardware-id',name:'Synthetic removable device',category:'USB_STORAGE'}};
    const service=new EndpointService(f.prisma);
    const first=await service.ingest(credential,{events:[event]});
    assert.equal(first.notifications.length,1);
    assert.equal(first.notifications[0].recipientId,f.admin.id);
    assert.equal(first.notifications[0].targetUserId,null,'device-level USB observation is never employee-attributed');
    assert.match(first.notifications[0].message,/Connection does not confirm storage access, file access, or data transfer/);
    assert.equal(first.notifications[0].message.includes(f.employee.name),false,'endpoint display text does not invent an employee attribution');
    assert.equal(JSON.stringify(first.notifications[0]).includes('synthetic-hardware-id'),false,'raw hardware identifier is not exposed in the alert');
    assert.equal(await f.prisma.endpointEvent.count({where:{eventId:event.eventId,userId:null}}),1,'USB remains a device-level, unattributed event');
    const duplicate=await service.ingest(credential,{events:[event]});
    assert.equal(duplicate.notifications.length,0,'replayed event does not send a duplicate notification');
    assert.equal(await f.prisma.securityNotification.count({where:{dedupeKey:`endpoint-usb:${device.id}:${event.eventId}`}}),1);
    assert.equal(await f.prisma.securityNotification.count({where:{companyId:'B',type:'ENDPOINT_USB_CONNECTED'}}),0,'notification stays within the device company');
  }finally{await f.close();}
});

test('USB retries, concurrent delivery, assignment mismatch, and same-attachment re-observation cannot create duplicate alerts',{timeout:60000},async()=>{
  const f=await deviceFixture();
  try{
    await f.prisma.user.update({where:{id:f.employee.id},data:{assignedAdminId:f.admin.id}});
    const credential=randomBytes(32).toString('base64url');
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'testing',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1002',credentialHash:hashSecret(credential),enrolledAt:new Date(),config:{paused:false}}});
    const service=new EndpointService(f.prisma),event=eventId=>({version:1,eventId,deviceId:device.id,type:'USB_CONNECTED',occurredAt:new Date().toISOString(),metadata:{hardwareId:'same-device',name:'Test USB',category:'USB_STORAGE'}});
    const first=event(randomUUID());
    const simultaneous=await Promise.all([service.ingest(credential,{events:[first]}),service.ingest(credential,{events:[first]})]);
    assert.equal(simultaneous.reduce((count,result)=>count+result.notifications.length,0),1,'concurrent delivery creates one notification');
    const retry=await service.ingest(credential,{events:[first]});assert.equal(retry.notifications.length,0);
    const repeated=await service.ingest(credential,{events:[event(randomUUID())]});assert.equal(repeated.notifications.length,0,'new UUID without a removal is a repeated observation, not a new connection');
    const invalid={...event(randomUUID()),deviceId:randomUUID()};
    await assert.rejects(()=>service.ingest(credential,{events:[invalid]}),error=>error instanceof EndpointError&&error.status===403);
    const synthetic={...event(randomUUID()),metadata:{hardwareId:'synthetic-only',name:'Synthetic-only source',category:'OTHER',synthetic:true}};
    await assert.rejects(()=>service.ingest(credential,{events:[synthetic]}),error=>error instanceof EndpointError&&error.status===400,'agent telemetry contract rejects simulator/test provenance fields');
    assert.equal(await f.prisma.securityNotification.count({where:{type:'ENDPOINT_USB_CONNECTED'}}),1);
    assert.equal(await f.prisma.endpointEvent.count({where:{deviceId:device.id,type:'USB_CONNECTED'}}),2,'device observations remain auditable even when the bell alert is deduplicated');
  }finally{await f.close();}
});

test('a validated removal permits a distinct later connection alert, and endpoint name never assigns an unknown employee',{timeout:60000},async()=>{
  const f=await deviceFixture();
  try{
    const service=new EndpointService(f.prisma),admin=f.admin;
    await assert.rejects(()=>service.assign(admin,{userId:'unknown-employee',name:'testing',platform:'win32',issueEnrollmentToken:false}),error=>error instanceof EndpointError&&error.status===404);
    const credential=randomBytes(32).toString('base64url');
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'testing',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1003',credentialHash:hashSecret(credential),enrolledAt:new Date(),config:{paused:false}}});
    const make=(type,eventId,at)=>({version:1,eventId,deviceId:device.id,type,occurredAt:at.toISOString(),metadata:{hardwareId:'removable-1',name:'Test storage',category:'USB_STORAGE'}});
    const now=Date.now();
    await service.ingest(credential,{events:[make('USB_CONNECTED',randomUUID(),new Date(now-2000))]});
    await service.ingest(credential,{events:[make('USB_REMOVED',randomUUID(),new Date(now-1000))]});
    const later=await service.ingest(credential,{events:[make('USB_CONNECTED',randomUUID(),new Date(now))]});
    assert.equal(later.notifications.length,1,'a removal followed by a connection is distinct');
    assert.equal(await f.prisma.securityNotification.count({where:{type:'ENDPOINT_USB_CONNECTED'}}),2);
  }finally{await f.close();}
});
