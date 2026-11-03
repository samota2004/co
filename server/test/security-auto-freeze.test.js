import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {savePolicy} from '../services/policy-service.js';

test('critical imported or non-resource evidence never triggers endpoint containment; duplicate evidence remains deduplicated',{timeout:90000},async()=>{
 const f=await deviceFixture();let sse;
 try{
  const {SecurityService}=await import('../services/security-service.js');sse=(await import('../services/sse.js')).sseManager;
  await f.prisma.department.create({data:{code:'FINANCE',name:'Finance'}});
  const endpoint=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic managed endpoint',platform:'win32',mappedIdentity:'S-1-5-21-12-23-34-1001',lastSeen:new Date(),config:{paused:false}}});
  const device=await f.prisma.device.create({data:{deviceId:randomUUID(),userId:f.employee.id,name:'Synthetic low-trust browser',os:'Windows',browser:'Chrome',ip:'192.0.2.4',location:'Fixture',trustScore:10,isTrusted:false,status:'SUSPICIOUS'}});
  const resource=await f.prisma.resource.create({data:{resourceId:randomUUID(),companyId:'A',name:'Synthetic finance resource',departmentCode:'FINANCE'}});
  const raw={eventId:randomUUID(),userId:f.employee.id,deviceId:device.id,resourceId:resource.id,eventType:'FILE_DOWNLOAD',timestamp:new Date().toISOString(),downloadVolumeMB:10000,failedAuthCount:5,isPrivilegeEscalation:true,isUsbTransfer:true};
  const service=new SecurityService(f.prisma),first=await service.evaluate(f.employee,raw,{ip:'127.0.0.1'});
  assert.equal(first.decision.decision,'RESTRICT');assert.equal(first.user.status,'RESTRICTED');assert.equal(first.decision.isFrozen,false);assert.equal(first.incident.severity,'CRITICAL');assert.equal(first.decision.containmentStatus,'NOT_REQUESTED');
  assert.equal(await f.prisma.endpointEnforcementCommand.count({where:{deviceId:endpoint.id}}),0,'non-RESOURCE_ACCESS evidence cannot trigger containment');
  assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id,incidentId:first.incident.id}}),1);
  const duplicate=await service.evaluate(f.employee,raw,{ip:'127.0.0.1'});assert.equal(duplicate.duplicate,true);assert.equal(await f.prisma.endpointEnforcementCommand.count({where:{deviceId:endpoint.id}}),0);assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id}}),1);
  assert.equal(await f.prisma.dailyRiskSnapshot.count({where:{userId:f.employee.id}}),1);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});

test('fresh authenticated contextual evidence can request containment without treating RF output as confidence',{timeout:90000},async()=>{
 const f=await deviceFixture();let sse;
 try{
  const {SecurityService}=await import('../services/security-service.js');sse=(await import('../services/sse.js')).sseManager;
  await f.prisma.department.create({data:{code:'FINANCE',name:'Finance'}});
  await f.prisma.user.update({where:{id:f.employee.id},data:{departmentCode:'ENGINEERING',assignedAdminId:f.admin.id}});
  await savePolicy(f.prisma,f.admin,{autoFreezeOnCritical:true});
  const endpoint=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Fresh mapped Windows endpoint',platform:'win32',mappedIdentity:'S-1-5-21-12-23-34-1002',lastSeen:new Date(),config:{paused:false}}});
  const device=await f.prisma.device.create({data:{deviceId:randomUUID(),userId:f.employee.id,name:'Verified assessment device',os:'Windows',browser:'Chrome',ip:'192.0.2.5',location:'Fixture',trustScore:10,isTrusted:false,status:'SUSPICIOUS'}});
  const resource=await f.prisma.resource.create({data:{resourceId:randomUUID(),companyId:'A',name:'Protected finance resource',departmentCode:'FINANCE',protectedData:'fixture'}});
  const service=new SecurityService(f.prisma),result=await service.evaluate(f.employee,{eventId:randomUUID(),userId:f.employee.id,deviceId:device.id,resourceId:resource.id,eventType:'RESOURCE_ACCESS',timestamp:new Date().toISOString(),downloadVolumeMB:10000,failedAuthCount:5,isPrivilegeEscalation:true,isUsbTransfer:true,isOffHours:true},{authenticatedResourceAccess:true,ip:'127.0.0.1'});
  assert.equal(result.decision.decision,'FREEZE');
  assert.ok(result.decision.evaluation.contextualEvidence>=90,'configured threshold is met by contextual evidence itself');
  assert.equal(result.decision.evaluation.mlAvailable,false,'unavailable ML did not become a numeric prediction');
  assert.equal(result.decision.containmentRequested,true);
  assert.equal(result.decision.containmentStatus,'REQUESTED');
  assert.equal(await f.prisma.endpointEnforcementCommand.count({where:{deviceId:endpoint.id,action:'BLOCK',status:'PENDING'}}),1);
  assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id,type:'CONTAINMENT_REQUESTED'}}),1);
  const duplicate=await service.evaluate(f.employee,{eventId:result.event.eventId||result.event.id,userId:f.employee.id,deviceId:device.id,resourceId:resource.id,eventType:'RESOURCE_ACCESS',timestamp:new Date().toISOString(),downloadVolumeMB:10000,failedAuthCount:5,isPrivilegeEscalation:true,isUsbTransfer:true,isOffHours:true},{authenticatedResourceAccess:true,ip:'127.0.0.1'});
  assert.equal(duplicate.duplicate,true);
  assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id,type:'CONTAINMENT_REQUESTED'}}),1,'event replay does not create another containment notification');
 }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});
