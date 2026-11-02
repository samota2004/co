import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import express from 'express';
import {deviceFixture} from './device-fixture.js';

test('AGENT_UNINSTALL requires Main Admin fresh MFA and completes once on its enrolled Windows device',{timeout:90000},async()=>{
  const fixture=await deviceFixture();let server,sse;
  try{
    const [{default:routes},{generateJwtToken},{EndpointService,hashSecret},{localOperationKey,verifyLocalOperationGrant}]=await Promise.all([
      import('../routes/endpoint.js'),import('../middleware/auth.js'),import('../services/endpoint-service.js'),import('../../agent/src/local-operation-auth.js')
    ]);
    sse=(await import('../services/sse.js')).sseManager;
    await fixture.prisma.role.create({data:{code:'SYSTEM_ADMIN',name:'System administrator'}});
    const mainAdmin=await fixture.prisma.user.create({data:{employeeId:randomUUID(),name:'Uninstall test Main Admin',email:`${randomUUID()}@test.invalid`,companyId:'A',roleCode:'SYSTEM_ADMIN',isMainAdmin:true}});
    const credential=randomBytes(32).toString('base64url');
    const device=await fixture.prisma.endpointDevice.create({data:{companyId:'A',userId:fixture.employee.id,name:'Synthetic uninstall endpoint',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),lastSeen:new Date(),agentVersion:'test-fixture',health:{queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{}},config:{}}});
    const app=express();app.use(express.json());app.use('/api/endpoint',routes);
    server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
    const base=`http://127.0.0.1:${server.address().port}/api/endpoint`;
    const adminHeaders=async verifiedAt=>{
      const session=await fixture.prisma.session.create({data:{sessionToken:randomUUID(),userId:mainAdmin.id,ip:'127.0.0.1',expiresAt:new Date(Date.now()+3600000),mfaVerifiedAt:verifiedAt}});
      return{Authorization:`Bearer ${generateJwtToken(mainAdmin,true,null,session.id)}`,'Content-Type':'application/json'};
    };
    const requestId=randomUUID(),request=await fetch(`${base}/local-operation-requests`,{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({requestId,action:'AGENT_UNINSTALL',requestedAt:new Date().toISOString(),deviceId:device.id,identity:device.mappedIdentity,reason:'Employee requested authorized removal'})});
    assert.equal(request.status,200);assert.equal((await request.json()).status,'AUTH_REQUESTED');
    const stale=await fetch(`${base}/local-operation-requests/${requestId}/review`,{method:'POST',headers:await adminHeaders(new Date(Date.now()-16*60*1000)),body:JSON.stringify({decision:'APPROVE',reason:'Approve synthetic uninstall'})});
    assert.equal(stale.status,403);assert.equal((await stale.json()).error.code,'FRESH_MFA_REQUIRED');
    const approval=await fetch(`${base}/local-operation-requests/${requestId}/review`,{method:'POST',headers:await adminHeaders(new Date()),body:JSON.stringify({decision:'APPROVE',reason:'Approve synthetic uninstall'})});
    assert.equal(approval.status,200);assert.equal((await approval.json()).status,'AUTH_APPROVED');
    const service=new EndpointService(fixture.prisma),health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false,administrativeState:'RUNNING',monitoringState:'ACTIVE',serviceControlState:'RUNNING'};
    const delivery=await service.heartbeat(credential,{agentVersion:'test-fixture',health},'127.0.0.1');
    assert.equal(delivery.localOperationGrant.action,'AGENT_UNINSTALL');
    assert.equal(verifyLocalOperationGrant(localOperationKey(credential),delivery.localOperationGrant,{deviceId:device.id,identity:device.mappedIdentity,action:'AGENT_UNINSTALL'}),true);
    const accepted=await service.heartbeat(credential,{agentVersion:'test-fixture',health,localOperationReport:{requestId,nonce:delivery.localOperationGrant.nonce,resultCode:'GRANT_ACCEPTED',reportedAt:new Date().toISOString()}},'127.0.0.1');
    assert.equal(accepted.localOperationAck,requestId);
    const completion=await fetch(`${base}/local-operation-requests/${requestId}/complete`,{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({nonce:delivery.localOperationGrant.nonce,result:'SUCCEEDED'})});
    assert.equal(completion.status,200);assert.equal((await completion.json()).credentialRevoked,true);
    const saved=await fixture.prisma.endpointEnforcementCommand.findUnique({where:{commandId:requestId}});
    assert.equal(saved.status,'AUTH_COMPLETED');assert.equal(saved.resultCode,'SUCCEEDED');
    const storedDevice=await fixture.prisma.endpointDevice.findUnique({where:{id:device.id}});
    assert.equal(storedDevice.credentialHash,null);assert.ok(storedDevice.revokedAt);
    const replay=await fetch(`${base}/local-operation-requests/${requestId}/complete`,{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:JSON.stringify({nonce:delivery.localOperationGrant.nonce,result:'SUCCEEDED'})});
    assert.equal(replay.status,401,'a completed uninstall cannot reuse its revoked device credential');
  }finally{
    if(sse)clearInterval(sse.heartbeatInterval);
    if(server)await new Promise(resolve=>server.close(resolve));
    await fixture.close();
  }
});
