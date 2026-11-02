import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {EndpointService,hashSecret} from '../services/endpoint-service.js';

test('authenticated USB connection creates one scoped admin notification without claiming data transfer',async()=>{
  const f=await deviceFixture();
  try{
    await f.prisma.user.update({where:{id:f.employee.id},data:{assignedAdminId:f.admin.id}});
    const credential=randomBytes(32).toString('base64url');
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic USB alert endpoint',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),config:{paused:false}}});
    const event={version:1,eventId:randomUUID(),deviceId:device.id,type:'USB_CONNECTED',occurredAt:new Date().toISOString(),metadata:{hardwareId:'synthetic-hardware-id',name:'Synthetic removable device'}};
    const service=new EndpointService(f.prisma);
    const first=await service.ingest(credential,{events:[event]});
    assert.equal(first.notifications.length,1);
    assert.equal(first.notifications[0].recipientId,f.admin.id);
    assert.equal(first.notifications[0].targetUserId,f.employee.id);
    assert.match(first.notifications[0].message,/Connection was observed; file access or data transfer is not confirmed/);
    assert.equal(JSON.stringify(first.notifications[0]).includes('synthetic-hardware-id'),false,'raw hardware identifier is not exposed in the alert');
    assert.equal(await f.prisma.endpointEvent.count({where:{eventId:event.eventId,userId:null}}),1,'USB remains a device-level, unattributed event');
    const duplicate=await service.ingest(credential,{events:[event]});
    assert.equal(duplicate.notifications.length,0,'replayed event does not send a duplicate notification');
    assert.equal(await f.prisma.securityNotification.count({where:{dedupeKey:`endpoint-usb:${event.eventId}`}}),1);
    assert.equal(await f.prisma.securityNotification.count({where:{companyId:'B',dedupeKey:`endpoint-usb:${event.eventId}`}}),0,'notification stays within the device company');
  }finally{await f.close();}
});
