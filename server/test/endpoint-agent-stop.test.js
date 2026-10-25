import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import express from 'express';
import {deviceFixture} from './device-fixture.js';

test('Windows agent stop is recent-MFA, tenant-scoped, expiring, acknowledged and audited',{timeout:90000},async()=>{
  const f=await deviceFixture();let server,sse;
  try{
    const [{default:routes},{generateJwtToken},{EndpointService,hashSecret}]=await Promise.all([import('../routes/endpoint.js'),import('../middleware/auth.js'),import('../services/endpoint-service.js')]);
    sse=(await import('../services/sse.js')).sseManager;
    const credential=randomBytes(32).toString('base64url'),device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic stop-command endpoint',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),lastSeen:new Date(),agentVersion:'test-fixture',health:{queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false},config:{paused:false}}});
    const app=express();app.use(express.json());app.use('/api/endpoint',routes);server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    const base=`http://127.0.0.1:${server.address().port}/api/endpoint`,session=async(user,mfaAt=new Date())=>{
      const row=await f.prisma.session.create({data:{sessionToken:randomUUID(),userId:user.id,ip:'127.0.0.1',expiresAt:new Date(Date.now()+3600000),mfaVerifiedAt:mfaAt}});
      return{Authorization:`Bearer ${generateJwtToken(user,true,null,row.id)}`,'Content-Type':'application/json'};
    };
    const fresh=await session(f.admin),stale=await session(f.admin,new Date(Date.now()-16*60*1000)),foreign=await session(f.otherAdmin);
    const post=(headers,body)=>fetch(`${base}/${device.id}/stop-agent`,{method:'POST',headers,body:JSON.stringify(body)});
    assert.equal((await post(stale,{reason:'Reviewed stop request'})).status,403,'stale MFA is denied');
    assert.equal((await post(foreign,{reason:'Reviewed stop request'})).status,404,'cross-company device is not disclosed');
    assert.equal((await post(fresh,{})).status,400,'an audit reason is mandatory');
    const created=await post(fresh,{reason:'Administrator approved maintenance'});assert.equal(created.status,200);const body=await created.json();assert.equal(body.command.status,'PENDING');assert.ok(Date.parse(body.command.expiresAt)>Date.now());
    const duplicate=await post(fresh,{reason:'Administrator approved maintenance'});assert.equal((await duplicate.json()).command.commandId,body.command.commandId,'repeated requests return the existing live command');
    const audit=await f.prisma.auditLog.findFirst({where:{action:'AGENT_STOP_REQUESTED',userId:f.employee.id}});assert.equal(audit.metadata.reason,'Administrator approved maintenance');assert.equal(audit.userEmail,f.admin.email);
    const service=new EndpointService(f.prisma),health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false};
    const delivered=await service.heartbeat(credential,{agentVersion:'test-fixture',health},'127.0.0.1');assert.equal(delivered.agentCommand.commandId,body.command.commandId);assert.equal(delivered.agentCommand.deviceId,device.id);assert.equal(delivered.agentCommand.action,'STOP_AGENT');
    const report={commandId:body.command.commandId,resultCode:'STOP_ACCEPTED',reportedAt:new Date().toISOString()};
    const ack=await service.heartbeat(credential,{agentVersion:'test-fixture',health,agentCommandReport:report},'127.0.0.1');assert.equal(ack.agentCommandAck,body.command.commandId);
    const saved=await f.prisma.endpointEnforcementCommand.findUnique({where:{commandId:body.command.commandId}});assert.equal(saved.status,'ACKNOWLEDGED');assert.equal(saved.resultCode,'STOP_ACCEPTED');
    const replay=await service.heartbeat(credential,{agentVersion:'test-fixture',health,agentCommandReport:report},'127.0.0.1');assert.equal(replay.agentCommandAck,null,'acknowledged command cannot be accepted twice');
    const dashboard=await service.dashboard(f.admin,f.employee.id,undefined,device.id,new Date().toISOString().slice(0,10));const shown=dashboard.devices[0].enforcementCommands.find(command=>command.commandId===body.command.commandId);assert.equal(shown.requestedBy,f.admin.name);assert.equal(shown.reason,'Administrator approved maintenance');
    await f.prisma.endpointEnforcementCommand.create({data:{companyId:'A',userId:f.employee.id,deviceId:device.id,action:'STOP_AGENT',status:'PENDING',reason:'Synthetic expiry fixture',issuedAt:new Date(Date.now()-180000),expiresAt:new Date(Date.now()-60000),createdById:f.admin.id}});
    await service.heartbeat(credential,{agentVersion:'test-fixture',health},'127.0.0.1');assert.ok(await f.prisma.endpointEnforcementCommand.findFirst({where:{deviceId:device.id,reason:'Synthetic expiry fixture',status:'EXPIRED'}}));
    const revoke=await fetch(`${base}/${device.id}/revoke`,{method:'POST',headers:fresh,body:JSON.stringify({})});assert.equal(revoke.status,400);
  }finally{if(sse)clearInterval(sse.heartbeatInterval);if(server)await new Promise(resolve=>server.close(resolve));await f.close();}
});
