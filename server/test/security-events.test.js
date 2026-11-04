import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('security event feed separates persisted containment events from incidents and preserves command state', {timeout:60000}, async()=>{
  const f=await deviceFixture();let server;
  try{
    const admin2=await f.prisma.user.create({data:{name:'Assigned security administrator',email:`${randomUUID()}@test.invalid`,employeeId:randomUUID(),companyId:'A',roleCode:'SECURITY_ADMIN',status:'ACTIVE'}});
    await f.prisma.user.update({where:{id:f.employee.id},data:{assignedAdminId:admin2.id}});
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Containment test endpoint',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1001',credentialHash:'fixture-hash',enrolledAt:new Date(),lastSeen:new Date(),agentVersion:'fixture',health:{},config:{}}});
    const command=await f.prisma.endpointEnforcementCommand.create({data:{companyId:'A',userId:f.employee.id,deviceId:device.id,action:'BLOCK',status:'PENDING',expiresAt:new Date(Date.now()+120000),reason:'Synthetic focused feed fixture'}});
    const dedupeKey=`containment:feed:${randomUUID()}`;
    const notificationData={companyId:'A',targetUserId:f.employee.id,dedupeKey,type:'CONTAINMENT_REQUESTED',severity:'CRITICAL',title:'Containment requested',message:'Synthetic fixture notification.',metadata:{commandIds:[command.commandId]}};
    await f.prisma.securityNotification.create({data:{...notificationData,recipientId:f.admin.id}});
    await f.prisma.securityNotification.create({data:{...notificationData,recipientId:admin2.id}});
    const incident=await f.prisma.incident.create({data:{incidentId:randomUUID(),title:'Independent persisted incident',userId:f.employee.id,userEmail:f.employee.email,severity:'CRITICAL',status:'OPEN',riskScore:91,contributingFactors:['SYNTHETIC_TEST_FIXTURE']}});

    const {default:routes}=await import('../routes/index.js');
    const {generateJwtToken}=await import('../middleware/auth.js');
    const app=express();app.use(express.json());app.use('/api',routes);
    server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    const base=`http://127.0.0.1:${server.address().port}/api`;
    const call=async(actor,path)=>{const response=await fetch(base+path,{headers:{Authorization:`Bearer ${generateJwtToken(actor,true)}`}});return{status:response.status,body:await response.json()};};

    let response=await call(f.admin,'/security-events');
    assert.equal(response.status,200);
    assert.equal(response.body.events.length,1,'recipient copies become one security event');
    assert.equal(response.body.events[0].status,'PENDING');
    assert.equal(response.body.events[0].eventCode,'CONTAINMENT_REQUESTED');
    assert.equal(response.body.events[0].device.name,device.name);
    assert.equal(response.body.metrics.totalIncidents,1);
    assert.equal(response.body.metrics.activeUnresolvedIncidents,1);
    assert.equal(response.body.metrics.totalSecurityEvents,1);
    assert.equal(response.body.metrics.pendingContainmentRequests,1);

    await f.prisma.securityNotification.updateMany({where:{dedupeKey,recipientId:f.admin.id},data:{readAt:new Date()}});
    response=await call(f.admin,'/security-events');
    assert.equal(response.body.events[0].status,'PENDING','read state does not resolve containment');
    await f.prisma.endpointEnforcementCommand.update({where:{id:command.id},data:{status:'EXPIRED',resultCode:'COMMAND_EXPIRED'}});
    response=await call(f.admin,'/security-events');
    assert.equal(response.body.events[0].status,'EXPIRED');

    const failedCommand=await f.prisma.endpointEnforcementCommand.create({data:{companyId:'A',userId:f.employee.id,deviceId:device.id,action:'BLOCK',status:'FAILED',resultCode:'ACCESS_DENIED',reason:'Synthetic failed fixture'}});
    await f.prisma.securityNotification.create({data:{companyId:'A',recipientId:f.admin.id,targetUserId:f.employee.id,dedupeKey:`containment:failed:${randomUUID()}`,type:'CONTAINMENT_FAILED',severity:'CRITICAL',title:'Endpoint containment failed',message:'Synthetic fixture notification.',metadata:{commandIds:[failedCommand.commandId]}}});
    response=await call(f.admin,'/security-events');
    assert.deepEqual(new Set(response.body.events.map(event=>event.status)),new Set(['EXPIRED','FAILED']));
    assert.equal(response.body.metrics.totalIncidents,1,'incident count stays independent from security-event count');
    assert.equal(response.body.metrics.totalSecurityEvents,2);

    const foreign=await call(f.otherAdmin,'/security-events');
    assert.equal(foreign.body.events.length,0,'tenant isolation excludes company A events');
    const employee=await call(f.employee,'/security-events');
    assert.ok([401,403].includes(employee.status),'employees cannot access administrative security events');
    assert.equal(incident.status,'OPEN');
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});
