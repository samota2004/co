import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {EndpointService,hashSecret} from '../services/endpoint-service.js';

const SID='S-1-5-21-11-22-33-1001';

async function enrolledDevice(f,userId=f.employee.id){
  const credential=randomBytes(32).toString('base64url');
  const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId,name:'Synthetic assessment endpoint',platform:'win32',mappedIdentity:SID,credentialHash:hashSecret(credential),enrolledAt:new Date(),config:{paused:false}}});
  return {credential,device};
}
const foreground=(deviceId,at=new Date())=>({version:1,eventId:randomUUID(),deviceId,type:'APPLICATION_FOREGROUND',occurredAt:at.toISOString(),metadata:{pid:4242,name:'notepad.exe',sessionId:'1',identity:SID}});
const usbStorage=(deviceId,hardwareId='synthetic-storage')=>({version:1,eventId:randomUUID(),deviceId,type:'USB_CONNECTED',occurredAt:new Date().toISOString(),metadata:{hardwareId,name:'Synthetic storage',category:'USB_STORAGE'}});

test('attributed endpoint activity records one zero-evidence assessment per employee hour',{timeout:60000},async()=>{
  const f=await deviceFixture();
  try{
    const {credential,device}=await enrolledDevice(f);
    const service=new EndpointService(f.prisma);
    await service.ingest(credential,{events:[foreground(device.id)]});
    const scores=await f.prisma.riskScore.findMany({where:{userId:f.employee.id}});
    assert.equal(scores.length,1,'first attributed activity records an assessment');
    assert.equal(scores[0].score,0,'ordinary activity carries no risk evidence');
    const employee=await f.prisma.user.findUnique({where:{id:f.employee.id}});
    assert.ok(employee.trustUpdatedAt,'trust is marked as assessed');
    assert.equal(employee.trustScore,f.employee.trustScore,'zero-evidence activity does not change trust');
    assert.equal(employee.status,'ACTIVE');
    await service.ingest(credential,{events:[foreground(device.id)]});
    assert.equal(await f.prisma.riskScore.count({where:{userId:f.employee.id}}),1,'a second batch in the same hour is not re-assessed');
    assert.equal(await f.prisma.activityEvent.count({where:{userId:f.employee.id}}),1);
  }finally{await f.close();}
});

test('USB storage connected while the employee is signed in adds bounded transfer evidence',{timeout:60000},async()=>{
  const f=await deviceFixture();
  try{
    const {credential,device}=await enrolledDevice(f);
    const service=new EndpointService(f.prisma);
    await service.ingest(credential,{events:[foreground(device.id),usbStorage(device.id)]});
    const usb=await f.prisma.riskScore.findFirst({where:{userId:f.employee.id,score:{gt:0}}});
    assert.ok(usb,'storage connection during an employee session is scored');
    assert.ok(usb.score>=8&&usb.score<60,'evidence stays below the MFA/incident threshold on its own');
    assert.ok(usb.factors.some(factor=>factor.factor==='Removable storage connected'));
    assert.equal(await f.prisma.incident.count({where:{userId:f.employee.id}}),0,'no incident from a connection alone');
    assert.equal(await f.prisma.riskScore.count({where:{userId:f.employee.id,score:0}}),0,'a recent positive score is not overwritten by a zero-evidence hour');
  }finally{await f.close();}
});

test('USB storage without an observed employee session is not attributed to the employee',{timeout:60000},async()=>{
  const f=await deviceFixture();
  try{
    const {credential,device}=await enrolledDevice(f);
    await new EndpointService(f.prisma).ingest(credential,{events:[usbStorage(device.id)]});
    assert.equal(await f.prisma.riskScore.count({where:{userId:f.employee.id}}),0);
    assert.equal((await f.prisma.user.findUnique({where:{id:f.employee.id}})).trustUpdatedAt,null);
  }finally{await f.close();}
});

test('restricted employees are not re-evaluated by background endpoint telemetry',{timeout:60000},async()=>{
  const f=await deviceFixture();
  try{
    const {credential,device}=await enrolledDevice(f);
    await f.prisma.user.update({where:{id:f.employee.id},data:{status:'RESTRICTED'}});
    const service=new EndpointService(f.prisma);
    await service.ingest(credential,{events:[foreground(device.id)]}).catch(()=>{});
    assert.equal(await f.prisma.riskScore.count({where:{userId:f.employee.id}}),0);
    assert.equal((await f.prisma.user.findUnique({where:{id:f.employee.id}})).status,'RESTRICTED','status is unchanged');
  }finally{await f.close();}
});