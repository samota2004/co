import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileAccountControl,signAccountControlCommand} from '../src/account-control.js';
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const employeeSid='S-1-5-21-111-222-333-1001',recoveryAdminSid='S-1-5-21-111-222-333-1002';
const secrets={deviceId:'00000000-0000-4000-8000-000000000001',mappedIdentity:employeeSid,credential:'test-enrollment-credential'};
const local={dataDirectory:path.join(os.tmpdir(),`cyberorbit-account-control-${process.pid}`),windowsAccountControl:{enabled:true,employeeSid,recoveryAdminSid,recoveryLoginVerified:true}};
const command=action=>{const c={deviceId:secrets.deviceId,identity:employeeSid,action,commandId:randomUUID(),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString()};c.signature=signAccountControlCommand(createHash('sha256').update(secrets.credential).digest(),c);return c;};
test('OS control refuses disabled, unsupported, stale and mismatched commands without invoking native helper',async()=>{
  let calls=0;const run=async()=>{calls++;return '{"code":"BLOCKED"}';};
  for(const [l,c,p] of [
    [{},command('BLOCK'),'win32'],[local,command('BLOCK'),'linux'],
    [local,undefined,'win32'],[local,{...command('BLOCK'),issuedAt:'2000-01-01T00:00:00Z'},'win32'],
    [local,{...command('BLOCK'),deviceId:'other'},'win32'],[local,{...command('BLOCK'),identity:recoveryAdminSid},'win32'],
    [local,{...command('BLOCK'),action:'DELETE'},'win32'],
    [{...local,windowsAccountControl:{...local.windowsAccountControl,recoveryAdminSid:employeeSid}},command('BLOCK'),'win32'],
    [{...local,windowsAccountControl:{...local.windowsAccountControl,recoveryLoginVerified:false}},command('BLOCK'),'win32'],
    [local,command('HOLD'),'win32']
  ]) await reconcileAccountControl(l,secrets,c,run,p);
  assert.equal(calls,0);
});
test('only enrollment SID is passed and sanitized native results distinguish block, pending, and recovery',async()=>{
  await fs.rm(local.dataDirectory,{recursive:true,force:true});await fs.mkdir(local.dataDirectory,{recursive:true});
  for(const code of ['BLOCKED','LOGOFF_PENDING','ALLOWED','RECOVERY_REQUIRED','UNSAFE_ACCOUNT','UNSAFE_RECOVERY','EXTERNALLY_DISABLED']){
    const run=async(file,input)=>{assert.equal(file,'windows-account-control.ps1');assert.equal(input.employeeSid,employeeSid);assert.equal(input.recoveryAdminSid,recoveryAdminSid);assert.equal(input.deviceId,secrets.deviceId);return JSON.stringify({code});};
    assert.equal(await reconcileAccountControl(local,secrets,command(code==='ALLOWED'?'ALLOW':'BLOCK'),run,'win32'),`reported: ${code}`);
  }
  assert.match(await reconcileAccountControl(local,secrets,command('BLOCK'),async()=>{throw new Error('sensitive native details');},'win32'),/^error:/);
  assert.equal(await reconcileAccountControl(local,secrets,command('BLOCK'),async()=>'{"code":"sensitive native details"}','win32'),'error: invalid native account-control response');
});

test('signed account-control commands are one-time and replay returns the persisted result without repeating OS work',async()=>{
  await fs.rm(local.dataDirectory,{recursive:true,force:true});await fs.mkdir(local.dataDirectory,{recursive:true});
  const instruction=command('BLOCK');let calls=0;
  const run=async()=>{calls++;return JSON.stringify({code:'BLOCKED'});};
  assert.equal(await reconcileAccountControl(local,secrets,instruction,run,'win32'),'reported: BLOCKED');
  assert.equal(await reconcileAccountControl(local,secrets,instruction,run,'win32'),'reported: BLOCKED');
  assert.equal(calls,1);
  await fs.rm(local.dataDirectory,{recursive:true,force:true});
});

test('partial logoff remains retryable until the helper confirms containment',async()=>{
  await fs.rm(local.dataDirectory,{recursive:true,force:true});await fs.mkdir(local.dataDirectory,{recursive:true});
  const instruction=command('BLOCK');let calls=0;
  const run=async()=>{calls++;return JSON.stringify({code:calls===1?'LOGOFF_PENDING':'BLOCKED'});};
  assert.equal(await reconcileAccountControl(local,secrets,instruction,run,'win32'),'reported: LOGOFF_PENDING');
  assert.equal(await reconcileAccountControl(local,secrets,instruction,run,'win32'),'reported: BLOCKED');
  assert.equal(await reconcileAccountControl(local,secrets,instruction,run,'win32'),'reported: BLOCKED');
  assert.equal(calls,2);
  await fs.rm(local.dataDirectory,{recursive:true,force:true});
});
