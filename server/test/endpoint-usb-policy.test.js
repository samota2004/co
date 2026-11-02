import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {EndpointService,hashSecret} from '../services/endpoint-service.js';

test('administrator USB policy is scoped, persisted, delivered, and honestly reported unverified',{timeout:90000},async()=>{
  const f=await deviceFixture();
  try{
    const credential=randomBytes(32).toString('base64url');
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic USB policy endpoint',platform:'win32',mappedIdentity:'S-1-5-21-1-2-3-1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),lastSeen:new Date(),config:{paused:false}}});
    const service=new EndpointService(f.prisma);
    const policy={storage:'BLOCK',portable:'ALLOW',optical:'BLOCK'};
    const created=await service.setUsbPolicy(f.admin,device.id,{policy,reason:'Approved synthetic policy test'});
    assert.equal(created.command.status,'PENDING');assert.deepEqual(created.command.policy,policy);
    assert.deepEqual((await f.prisma.endpointDevice.findUnique({where:{id:device.id}})).config.usbPolicy,policy);
    await assert.rejects(()=>service.setUsbPolicy(f.otherAdmin,device.id,{policy,reason:'Foreign admin policy'}),/not found in company/);
    const manager={...f.admin,roleCode:'MANAGER'};
    await assert.rejects(()=>service.setUsbPolicy(manager,device.id,{policy,reason:'Manager policy denied'}),/Active administrator required/);
    const health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false};
    const delivered=await service.heartbeat(credential,{agentVersion:'test-fixture',health},'127.0.0.1');
    assert.equal(delivered.usbPolicyCommand.commandId,created.command.commandId);assert.deepEqual(delivered.usbPolicyCommand.policy,policy);assert.match(delivered.usbPolicyCommand.signature,/^[A-Za-z0-9_-]{43}$/,'policy command carries an HMAC authentication tag');
    const acknowledged=await service.heartbeat(credential,{agentVersion:'test-fixture',health,usbPolicyReport:{commandId:created.command.commandId,resultCode:'POLICY_APPLIED_UNVERIFIED',reportedAt:new Date().toISOString(),policy}},'127.0.0.1');
    assert.equal(acknowledged.usbPolicyCommandAck,created.command.commandId);
    const saved=await f.prisma.endpointEnforcementCommand.findUnique({where:{commandId:created.command.commandId}});
    assert.equal(saved.status,'UNVERIFIED','command acknowledgement is not proof of effective OS block');
    assert.equal(saved.resultCode,'POLICY_APPLIED_UNVERIFIED');
    const allowPolicy={storage:'ALLOW',portable:'ALLOW',optical:'ALLOW'};
    const reset=await service.setUsbPolicy(f.admin,device.id,{policy:allowPolicy,reason:'Approved return to default allow'});
    const resetDelivery=await service.heartbeat(credential,{agentVersion:'test-fixture',health},'127.0.0.1');
    assert.deepEqual(resetDelivery.usbPolicyCommand.policy,allowPolicy,'ALLOW policy is sent through the same enrolled-device heartbeat');
    assert.equal(reset.command.status,'PENDING');
    const unverified=await service.heartbeat(credential,{agentVersion:'test-fixture',health,usbPolicyReport:{commandId:reset.command.commandId,resultCode:'POLICY_UNVERIFIED',reportedAt:new Date().toISOString(),policy:allowPolicy}},'127.0.0.1');
    assert.equal(unverified.usbPolicyCommandAck,reset.command.commandId);
    const resetSaved=await f.prisma.endpointEnforcementCommand.findUnique({where:{commandId:reset.command.commandId}});
    assert.equal(resetSaved.status,'UNVERIFIED','an ambiguous native-helper report stays unverified instead of becoming a failure');
    assert.equal(resetSaved.resultCode,'POLICY_UNVERIFIED');
    const dashboard=await service.dashboard(f.admin,f.employee.id,undefined,device.id,new Date().toISOString().slice(0,10));
    assert.deepEqual(dashboard.devices[0].config.usbPolicy,allowPolicy);
    assert.ok(dashboard.devices[0].enforcementCommands.some(command=>command.commandId===created.command.commandId));
  }finally{await f.close();}
});

test('USB policy defaults to allow and unsupported platforms fail closed',{timeout:90000},async()=>{
  const f=await deviceFixture();
  try{
    const credential=randomBytes(32).toString('base64url');
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic non-Windows endpoint',platform:'linux',mappedIdentity:'uid:1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),lastSeen:new Date(),config:{paused:false}}});
    const service=new EndpointService(f.prisma);
    await assert.rejects(()=>service.setUsbPolicy(f.admin,device.id,{policy:{storage:'BLOCK',portable:'ALLOW',optical:'ALLOW'},reason:'Unsupported platform test'}),/mapped Windows service agent/);
    const heartbeat=await service.heartbeat(credential,{agentVersion:'test-fixture',health:{queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false}},'127.0.0.1');
    assert.deepEqual(heartbeat.config.usbPolicy,{storage:'ALLOW',portable:'ALLOW',optical:'ALLOW'});
  }finally{await f.close();}
});
