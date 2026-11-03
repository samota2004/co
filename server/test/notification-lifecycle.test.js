import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomBytes,randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('critical security assessment creates a deduplicated, assigned-admin notification', {timeout:60000},async()=>{
 const f=await deviceFixture();let sse;
 try{
  await f.prisma.user.update({where:{id:f.employee.id},data:{assignedAdminId:f.admin.id}});
  const {SecurityService}=await import('../services/security-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  const service=new SecurityService(f.prisma),eventId=randomUUID();
  const result=await service.evaluate(f.admin,{userId:f.employee.id,eventId,eventType:'FILE_DOWNLOAD',downloadVolumeMB:1000,failedAuthCount:10,isUsbTransfer:true,isOffHours:true});
  assert.equal(result.incident.severity,'CRITICAL');assert.equal(result.notifications.length,1);
  assert.equal(result.notifications[0].recipientId,f.admin.id);assert.equal(result.notifications[0].targetUserId,f.employee.id);
  assert.equal(await f.prisma.securityNotification.count({where:{dedupeKey:`incident:${result.incident.id}`,recipientId:f.admin.id}}),1);
  const duplicate=await service.evaluate(f.admin,{userId:f.employee.id,eventId,eventType:'FILE_DOWNLOAD',downloadVolumeMB:1000,failedAuthCount:10,isUsbTransfer:true,isOffHours:true});
  assert.equal(duplicate.duplicate,true);assert.equal(await f.prisma.securityNotification.count({where:{dedupeKey:`incident:${result.incident.id}`,recipientId:f.admin.id}}),1);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});

test('unsupported containment acknowledgement persists one scoped failure notification',{timeout:60000},async()=>{
 const f=await deviceFixture();
 try{
  const {EndpointService,hashSecret}=await import('../services/endpoint-service.js');
  const credential=randomBytes(32).toString('base64url');
  const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Unsupported containment fixture',platform:'win32',mappedIdentity:'S-1-5-21-22-33-44-1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),lastSeen:new Date(),agentVersion:'fixture',health:{queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false},config:{paused:false}}});
  const command=await f.prisma.endpointEnforcementCommand.create({data:{companyId:'A',userId:f.employee.id,deviceId:device.id,action:'BLOCK',status:'PENDING',expiresAt:new Date(Date.now()+120000),reason:'Test unsupported result'}});
  const service=new EndpointService(f.prisma),health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false};
  await service.heartbeat(credential,{agentVersion:'fixture',health,accountControlReport:{commandId:command.commandId,resultCode:'UNSUPPORTED_MACHINE',reportedAt:new Date().toISOString()}},'127.0.0.1');
  assert.equal((await f.prisma.endpointEnforcementCommand.findUnique({where:{commandId:command.commandId}})).status,'UNSUPPORTED');
  assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id,type:'CONTAINMENT_UNSUPPORTED'}}),1);
  await service.heartbeat(credential,{agentVersion:'fixture',health,accountControlReport:{commandId:command.commandId,resultCode:'UNSUPPORTED_MACHINE',reportedAt:new Date().toISOString()}},'127.0.0.1');
  assert.equal(await f.prisma.securityNotification.count({where:{targetUserId:f.employee.id,type:'CONTAINMENT_UNSUPPORTED'}}),1,'replayed report does not duplicate notification');
 }finally{await f.close();}
});

test('admin notifications are recipient-scoped, persisted, listed, and read state updates unread count',{timeout:60000},async()=>{
 const f=await deviceFixture();let server;
 try{
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  const app=express();app.use(express.json());app.use('/api',routes);
  server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const origin=`http://127.0.0.1:${server.address().port}/api`;
  const create=async(recipientId,companyId='A',title='Contained endpoint requires review')=>f.prisma.securityNotification.create({data:{companyId,recipientId,targetUserId:f.employee.id,dedupeKey:`notification-test:${randomUUID()}`,type:'SECURITY_INCIDENT',severity:'CRITICAL',title,message:'Test fixture only; no real endpoint action was issued.',metadata:{testFixture:true}}});
  const notification=await create(f.admin.id),other=await create(f.otherAdmin.id),foreign=await create(f.admin.id,'B','Foreign tenant alert');
  const call=async(user,path,method='GET')=>{const response=await fetch(origin+path,{method,headers:{Authorization:`Bearer ${generateJwtToken(user,true)}`}});return{status:response.status,body:await response.json()};};
  const listed=await call(f.admin,'/notifications?limit=20');
  assert.equal(listed.status,200);assert.equal(listed.body.unread,1);assert.ok(listed.body.notifications.some(row=>row.id===notification.id));
  assert.ok(!listed.body.notifications.some(row=>row.id===other.id||row.id===foreign.id),'other recipient and tenant notifications are not exposed');
  const employee=await call(f.employee,'/notifications');assert.ok(employee.status===401||employee.status===403,'standard employees cannot access administrator notifications');
  const marked=await call(f.admin,`/notifications/${encodeURIComponent(notification.id)}/read`,'PATCH');assert.equal(marked.status,200);
  assert.equal((await call(f.admin,'/notifications')).body.unread,0);
  const second=await create(f.admin.id,'A','Second alert');
  const all=await call(f.admin,'/notifications/read-all','POST');assert.equal(all.status,200);assert.equal(all.body.updated,1);
  assert.equal((await call(f.admin,'/notifications')).body.unread,0);
  assert.ok(await f.prisma.securityNotification.findUnique({where:{id:second.id}}).then(row=>row.readAt));
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});
