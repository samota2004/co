import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import express from 'express';
import {deviceFixture} from './device-fixture.js';

// Manual Main Admin containment with no critical incident, where the laptop
// never confirmed the OS lock, must still be restorable.
async function harness(){
  const f=await deviceFixture();
  const {default:routes}=await import('../routes/index.js');
  const {generateJwtToken}=await import('../middleware/auth.js');
  const {hashSecret,EndpointService}=await import('../services/endpoint-service.js');
  const sse=(await import('../services/sse.js')).sseManager;
  const app=express();app.use(express.json());app.use('/api',routes);
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const headers={Authorization:`Bearer ${generateJwtToken(f.admin,true)}`,'Content-Type':'application/json'};
  const call=async(path,body)=>{const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:res.status,data:await res.json()};};
  const health={queueEvents:0,queueBytes:0,droppedEvents:0,collectors:{},helperLastSeen:null,paused:false};
  const enroll=async()=>{
    const credential=randomBytes(32).toString('base64url');
    const device=await f.prisma.endpointDevice.create({data:{companyId:'A',userId:f.employee.id,name:'Synthetic restoration endpoint',platform:'win32',mappedIdentity:'S-1-5-21-11-22-33-1001',credentialHash:hashSecret(credential),enrolledAt:new Date(),lastSeen:new Date(),agentVersion:'test-fixture',health,config:{paused:false}}});
    return{credential,device};
  };
  const service=new EndpointService(f.prisma);
  const heartbeat=(credential,report)=>service.heartbeat(credential,{agentVersion:'test-fixture',health,...(report?{accountControlReport:report}:{})},'127.0.0.1');
  const status=async()=>(await f.prisma.user.findUnique({where:{id:f.employee.id}})).status;
  const close=async()=>{await new Promise(resolve=>server.close(resolve));clearInterval(sse.heartbeatInterval);await f.close();};
  return{f,call,enroll,heartbeat,status,close};
}

test('a manual freeze whose laptop reported account control disabled is restored immediately',{timeout:90000},async()=>{
  const h=await harness();
  try{
    const {credential}=await h.enroll();
    assert.equal((await h.call(`/users/${h.f.employee.id}/freeze`,{reason:'Manual containment for review'})).status,200);
    const block=await h.heartbeat(credential);assert.equal(block.accountControl.action,'BLOCK');
    await h.heartbeat(credential,{commandId:block.accountControl.commandId,resultCode:'CONTROL_DISABLED',reportedAt:new Date().toISOString()});
    assert.equal(await h.status(),'RESTRICTED','failed OS lock leaves the account application-restricted');
    const pre=await h.call(`/users/${h.f.employee.id}/restoration-status`);
    assert.equal(pre.status,200);assert.equal(pre.data.canRestore,true);assert.equal(pre.data.restorationMode,'IMMEDIATE');
    const restored=await h.call(`/users/${h.f.employee.id}/unfreeze`,{reason:'Reviewed: containment no longer needed'});
    assert.equal(restored.status,200);assert.equal(restored.data.user.status,'ACTIVE');assert.deepEqual(restored.data.endpointEnforcement,[]);
    assert.equal(await h.status(),'ACTIVE');
    assert.equal(await h.f.prisma.auditLog.count({where:{action:'ACCOUNT_RESTORED',userId:h.f.employee.id}}),1);
    assert.notEqual((await h.heartbeat(credential)).accountControl?.action,'BLOCK','no lock is delivered after restoration');
  }finally{await h.close();}
});

test('an expired, never-answered BLOCK is cancelled and cannot lock the laptop after restoration',{timeout:90000},async()=>{
  const h=await harness();
  try{
    const {credential}=await h.enroll();
    await h.call(`/users/${h.f.employee.id}/freeze`,{reason:'Manual containment for review'});
    await h.f.prisma.endpointEnforcementCommand.updateMany({where:{userId:h.f.employee.id,action:'BLOCK'},data:{expiresAt:new Date(Date.now()-1000)}});
    const restored=await h.call(`/users/${h.f.employee.id}/unfreeze`,{reason:'Reviewed: laptop was offline'});
    assert.equal(restored.status,200);assert.equal(await h.status(),'ACTIVE');
    assert.equal(await h.f.prisma.endpointEnforcementCommand.count({where:{userId:h.f.employee.id,action:'BLOCK',status:{in:['PENDING','PENDING_OFFLINE']}}}),0);
    assert.notEqual((await h.heartbeat(credential)).accountControl?.action,'BLOCK');
  }finally{await h.close();}
});

test('restoration waits while a BLOCK is still awaiting the laptop answer',{timeout:90000},async()=>{
  const h=await harness();
  try{
    await h.enroll();
    await h.call(`/users/${h.f.employee.id}/freeze`,{reason:'Manual containment for review'});
    const early=await h.call(`/users/${h.f.employee.id}/unfreeze`,{reason:'Reviewed too early'});
    assert.equal(early.status,409);assert.equal(early.data.error.code,'NO_CONFIRMED_CONTAINMENT');
    assert.equal(await h.status(),'RESTRICTED');
    const pre=await h.call(`/users/${h.f.employee.id}/restoration-status`);
    assert.equal(pre.data.canRestore,false);assert.ok(pre.data.blockingReasons.some(reason=>reason.code==='CONTAINMENT_IN_PROGRESS'));
  }finally{await h.close();}
});

test('an unresolved critical incident still blocks restoration; no endpoint means immediate restore',{timeout:90000},async()=>{
  const h=await harness();
  try{
    await h.call(`/users/${h.f.employee.id}/freeze`,{reason:'Manual containment for review'});
    const hold=await h.f.prisma.incident.create({data:{incidentId:randomUUID(),title:'Synthetic critical hold',userId:h.f.employee.id,userEmail:h.f.employee.email,severity:'CRITICAL',status:'OPEN',riskScore:95,contributingFactors:['SYNTHETIC_TEST_FIXTURE']}});
    const held=await h.call(`/users/${h.f.employee.id}/unfreeze`,{reason:'Reviewed: attempting restore'});
    assert.equal(held.status,409);assert.equal(held.data.error.code,'CRITICAL_HOLD_ACTIVE');
    await h.f.prisma.incident.update({where:{id:hold.id},data:{status:'RESOLVED',resolvedAt:new Date()}});
    const restored=await h.call(`/users/${h.f.employee.id}/unfreeze`,{reason:'Reviewed: incident resolved'});
    assert.equal(restored.status,200);assert.equal(await h.status(),'ACTIVE');
  }finally{await h.close();}
});