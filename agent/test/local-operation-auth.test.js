import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {localOperationKey,signLocalOperationGrant,verifyLocalOperationGrant,persistVerifiedLocalOperationGrant,clearLocalOperationGrant} from '../src/local-operation-auth.js';
import {startIpc,sendSample} from '../src/ipc.js';

test('local service/uninstall grants are signed, short-lived and bound to device, identity and exact action',()=>{
  const credential=randomBytes(32).toString('base64url'),deviceId=randomUUID(),identity='S-1-5-21-11-22-33-1001',issuedAt=new Date(100000).toISOString();
  const grant={version:1,requestId:randomUUID(),deviceId,identity,action:'SERVICE_STOP',issuedAt,expiresAt:new Date(160000).toISOString(),nonce:randomUUID()};
  grant.signature=signLocalOperationGrant(localOperationKey(credential),grant);
  const context={deviceId,identity,action:'SERVICE_STOP',now:120000};
  assert.equal(verifyLocalOperationGrant(localOperationKey(credential),grant,context),true);
  assert.equal(verifyLocalOperationGrant(localOperationKey(credential),grant,{...context,deviceId:randomUUID()}),false);
  assert.equal(verifyLocalOperationGrant(localOperationKey(credential),grant,{...context,action:'AGENT_UNINSTALL'}),false);
  assert.equal(verifyLocalOperationGrant(localOperationKey(credential),grant,{...context,identity:'S-1-5-21-OTHER'}),false);
  assert.equal(verifyLocalOperationGrant(localOperationKey(credential),grant,{...context,now:160000}),false);
  const altered={...grant,action:'AGENT_UNINSTALL'};
  assert.equal(verifyLocalOperationGrant(localOperationKey(credential),altered,{...context,action:'AGENT_UNINSTALL'}),false);
  assert.equal(verifyLocalOperationGrant(localOperationKey(randomBytes(32).toString('base64url')),grant,context),false);
});

test('expired grant leftovers are replaced, active grants are not displaced, and a completed stop clears its grant',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-local-operation-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const credential=randomBytes(32).toString('base64url'),key=localOperationKey(credential),secrets={deviceId:randomUUID(),mappedIdentity:'S-1-5-21-11-22-33-1001'},now=Date.now();
  const makeGrant=(issued,expires)=>{const grant={version:1,requestId:randomUUID(),deviceId:secrets.deviceId,identity:secrets.mappedIdentity,action:'SERVICE_STOP',issuedAt:new Date(issued).toISOString(),expiresAt:new Date(expires).toISOString(),nonce:randomUUID()};grant.signature=signLocalOperationGrant(key,grant);return grant;};
  const expired=makeGrant(now-180000,now-60000);await fs.writeFile(path.join(directory,'local-operation-grant.json'),JSON.stringify(expired));
  const fresh=makeGrant(now,now+60000);assert.equal(await persistVerifiedLocalOperationGrant(directory,key,fresh,secrets,now),true);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory,'local-operation-grant.json'),'utf8')).nonce,fresh.nonce);
  const second=makeGrant(now,now+60000);assert.equal(await persistVerifiedLocalOperationGrant(directory,key,second,secrets,now),false,'a live grant cannot be displaced');
  await clearLocalOperationGrant(directory);await assert.rejects(fs.access(path.join(directory,'local-operation-grant.json')));
});

test('mapped desktop helper can submit only an authenticated local-operation request to the running service',async t=>{
  const helperKey=randomBytes(32).toString('base64'),identity='S-1-5-21-11-22-33-1001';
  const server=await startIpc({helperKey,mappedIdentity:identity},async sample=>{
    assert.equal(sample.identity,identity);
    assert.equal(sample.action,'SERVICE_STOP');
    assert.equal(sample.reason,'Employee request for service stop');
    return{localOperationRequest:{requestId:sample.requestId,status:'AUTH_REQUESTED'}};
  },{port:0});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const reply=await sendSample({key:helperKey,identity},{kind:'local-operation-request',identity,action:'SERVICE_STOP',requestId:randomUUID(),requestedAt:new Date().toISOString(),reason:'Employee request for service stop'},{port:server.address().port});
  assert.equal(reply.localOperationRequest.status,'AUTH_REQUESTED');
});

test('backend/API failure on the local service path fails closed without returning an approval',async t=>{
  const helperKey=randomBytes(32).toString('base64'),identity='S-1-5-21-11-22-33-1001';
  const server=await startIpc({helperKey,mappedIdentity:identity},async()=>{throw new Error('backend unavailable');},{port:0});
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await assert.rejects(sendSample({key:helperKey,identity},{kind:'local-operation-request',identity,action:'SERVICE_STOP',requestId:randomUUID(),requestedAt:new Date().toISOString(),reason:'Employee request for service stop'},{port:server.address().port}));
});
