import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('automatic freeze requires attributable corroborated evidence and is deduplicated with alert evidence',{timeout:90000},async()=>{
 const f=await deviceFixture();let sse;
 try{
  const {SecurityService}=await import('../services/security-service.js');sse=(await import('../services/sse.js')).sseManager;
  await f.prisma.department.create({data:{code:'FINANCE',name:'Finance'}});
  const endpoint=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic offline managed endpoint',platform:'win32',mappedIdentity:'S-1-5-21-12-23-34-1001',lastSeen:new Date(Date.now()-600000),config:{paused:false}}});
  const device=await f.prisma.device.create({data:{deviceId:randomUUID(),userId:f.employee.id,name:'Synthetic low-trust browser',os:'Windows',browser:'Chrome',ip:'192.0.2.4',location:'Fixture',trustScore:10,isTrusted:false,status:'SUSPICIOUS'}});
  const resource=await f.prisma.resource.create({data:{resourceId:randomUUID(),companyId:'A',name:'Synthetic finance resource',departmentCode:'FINANCE'}});
  const raw={eventId:randomUUID(),userId:f.employee.id,deviceId:device.id,resourceId:resource.id,eventType:'FILE_DOWNLOAD',timestamp:new Date().toISOString(),downloadVolumeMB:10000,failedAuthCount:5,isPrivilegeEscalation:true,isUsbTransfer:true};
  const service=new SecurityService(f.prisma),first=await service.evaluate(f.employee,raw,{ip:'127.0.0.1'});
  assert.equal(first.decision.decision,'FREEZE');assert.equal(first.user.status,'FROZEN');assert.equal(first.incident.severity,'CRITICAL');
  const command=await f.prisma.endpointEnforcementCommand.findFirst({where:{deviceId:endpoint.id}});assert.equal(command.status,'PENDING_OFFLINE');assert.equal(command.action,'BLOCK');
  assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id,incidentId:first.incident.id}}),1);
  const duplicate=await service.evaluate(f.employee,raw,{ip:'127.0.0.1'});assert.equal(duplicate.duplicate,true);assert.equal(await f.prisma.endpointEnforcementCommand.count({where:{deviceId:endpoint.id}}),1);assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id}}),1);
  assert.equal(await f.prisma.dailyRiskSnapshot.count({where:{userId:f.employee.id}}),1);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});
