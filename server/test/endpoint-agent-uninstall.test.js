import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import express from 'express';
import {deviceFixture} from './device-fixture.js';

test('AGENT_UNINSTALL requires Main Admin fresh MFA and completes once on enrolled Windows and macOS devices',{timeout:90000},async()=>{
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

    const macCredential=randomBytes(32).toString('base64url'),macDevice=await fixture.prisma.endpointDevice.create({data:{companyId:'A',userId:fixture.employee.id,name:'Synthetic macOS employee endpoint',platform:'darwin',mappedIdentity:'uid:501',credentialHash:hashSecret(macCredential),enrolledAt:new Date(),lastSeen:new Date(),agentVersion:'test-fixture',health:{queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{}},config:{}}});
    const macStopId=randomUUID(),macStop=await fetch(`${base}/local-operation-requests`,{method:'POST',headers:{Authorization:`Bearer ${macCredential}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:macStopId,action:'SERVICE_STOP',requestedAt:new Date().toISOString(),deviceId:macDevice.id,identity:macDevice.mappedIdentity,reason:'Employee requests unsupported service stop'})});
    assert.equal(macStop.status,403,'the macOS employee flow must not receive Windows SERVICE_STOP authorization');
    const macRequestId=randomUUID(),macRequest=await fetch(`${base}/local-operation-requests`,{method:'POST',headers:{Authorization:`Bearer ${macCredential}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:macRequestId,action:'AGENT_UNINSTALL',requestedAt:new Date().toISOString(),deviceId:macDevice.id,identity:macDevice.mappedIdentity,reason:'Employee requests Main Admin authorized Mac removal'})});
    assert.equal(macRequest.status,200);assert.equal((await macRequest.json()).status,'AUTH_REQUESTED');
    const macApproval=await fetch(`${base}/local-operation-requests/${macRequestId}/review`,{method:'POST',headers:await adminHeaders(new Date()),body:JSON.stringify({decision:'APPROVE',reason:'Approve Mac uninstall with fresh MFA'})});
    assert.equal(macApproval.status,200);
    const macDelivery=await service.heartbeat(macCredential,{agentVersion:'test-fixture',health},'127.0.0.1');
    assert.equal(macDelivery.localOperationGrant.action,'AGENT_UNINSTALL');
    assert.equal(verifyLocalOperationGrant(localOperationKey(macCredential),macDelivery.localOperationGrant,{deviceId:macDevice.id,identity:macDevice.mappedIdentity,action:'AGENT_UNINSTALL'}),true);
    const macAccepted=await service.heartbeat(macCredential,{agentVersion:'test-fixture',health,localOperationReport:{requestId:macRequestId,nonce:macDelivery.localOperationGrant.nonce,resultCode:'GRANT_ACCEPTED',reportedAt:new Date().toISOString()}},'127.0.0.1');
    assert.equal(macAccepted.localOperationAck,macRequestId);
    const macStatus=await fetch(`${base}/local-operation-requests/${macRequestId}/status`,{headers:{Authorization:`Bearer ${macCredential}`}});
    assert.equal((await macStatus.json()).status,'AUTH_EXECUTING');
    const macCompletion=await fetch(`${base}/local-operation-requests/${macRequestId}/complete`,{method:'POST',headers:{Authorization:`Bearer ${macCredential}`,'Content-Type':'application/json'},body:JSON.stringify({nonce:macDelivery.localOperationGrant.nonce,result:'SUCCEEDED'})});
    assert.equal(macCompletion.status,200);assert.equal((await macCompletion.json()).credentialRevoked,true);
    const macSaved=await fixture.prisma.endpointEnforcementCommand.findUnique({where:{commandId:macRequestId}});
    assert.equal(macSaved.status,'AUTH_COMPLETED');
    const macStored=await fixture.prisma.endpointDevice.findUnique({where:{id:macDevice.id}});
    assert.equal(macStored.credentialHash,null);assert.ok(macStored.revokedAt);

    const failedCredential=randomBytes(32).toString('base64url'),failedDevice=await fixture.prisma.endpointDevice.create({data:{companyId:'A',userId:fixture.employee.id,name:'Synthetic failed macOS uninstall',platform:'darwin',mappedIdentity:'uid:502',credentialHash:hashSecret(failedCredential),enrolledAt:new Date(),lastSeen:new Date(),agentVersion:'test-fixture',health:{queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{}},config:{}}});
    const failedId=randomUUID(),failedRequest=await fetch(`${base}/local-operation-requests`,{method:'POST',headers:{Authorization:`Bearer ${failedCredential}`,'Content-Type':'application/json'},body:JSON.stringify({requestId:failedId,action:'AGENT_UNINSTALL',requestedAt:new Date().toISOString(),deviceId:failedDevice.id,identity:failedDevice.mappedIdentity,reason:'Employee requests authorized removal test'})});
    assert.equal(failedRequest.status,200);
    const failedApproval=await fetch(`${base}/local-operation-requests/${failedId}/review`,{method:'POST',headers:await adminHeaders(new Date()),body:JSON.stringify({decision:'APPROVE',reason:'Approve failure-path fixture'})});assert.equal(failedApproval.status,200);
    const failedGrant=await service.heartbeat(failedCredential,{agentVersion:'test-fixture',health},'127.0.0.1');
    const failedAck=await service.heartbeat(failedCredential,{agentVersion:'test-fixture',health,localOperationReport:{requestId:failedId,nonce:failedGrant.localOperationGrant.nonce,resultCode:'GRANT_ACCEPTED',reportedAt:new Date().toISOString()}},'127.0.0.1');assert.equal(failedAck.localOperationAck,failedId);
    const failedCompletion=await fetch(`${base}/local-operation-requests/${failedId}/complete`,{method:'POST',headers:{Authorization:`Bearer ${failedCredential}`,'Content-Type':'application/json'},body:JSON.stringify({nonce:failedGrant.localOperationGrant.nonce,result:'FAILED'})});
    assert.equal(failedCompletion.status,200);assert.equal((await failedCompletion.json()).credentialRevoked,false);
    const failedStored=await fixture.prisma.endpointDevice.findUnique({where:{id:failedDevice.id}});
    assert.equal(failedStored.credentialHash,hashSecret(failedCredential));assert.equal(failedStored.revokedAt,null);
  }finally{
    if(sse)clearInterval(sse.heartbeatInterval);
    if(server)await new Promise(resolve=>server.close(resolve));
    await fixture.close();
  }
});
