import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nativeInput, nativeErrorCategory, nativeFailure, exec, powershell } from '../src/native.js';
import { runService } from '../src/service.js';

test('native diagnostics classify without echoing stderr, helper input or decrypted output', async () => {
  const secret=randomBytes(32).toString('base64url');
  for(const [text,category] of [['PSSecurityException','EXECUTION_POLICY'],['UnauthorizedAccessException','FILE_ACCESS'],['PathNotFound','HELPER_NOT_FOUND'],['CryptographicException','DPAPI_FAILURE'],['ConvertFrom-Json','INPUT_INVALID'],['CompilerError','NATIVE_COMPILE']]) {
    const error=nativeFailure('vault.ps1',1,nativeErrorCategory(`${text} ${secret}`));
    assert.equal(error.category,category);assert.equal(error.helper,'vault.ps1');assert.equal(error.exitCode,1);assert.ok(!error.message.includes(secret));
  }
  await assert.rejects(nativeInput('../outside.ps1',{credential:secret}),e=>e.category==='HELPER_NOT_ALLOWED'&&!e.message.includes(secret));
});

test('credential startup failure releases the service lock without deleting local data', {skip:process.platform!=='win32'}, async t => {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-service-lock-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  await fs.writeFile(path.join(directory,'retained-queue-marker'),'retain');
  await assert.rejects(runService({dataDirectory:directory}),e=>e.code==='ENOENT');
  await assert.rejects(fs.access(path.join(directory,'service.lock')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(directory,'retained-queue-marker'),'utf8'),'retain');
});

test('Restricted child reproduces vault failure; process-scoped override preserves machine policy and LocalMachine DPAPI', {skip:process.platform!=='win32',timeout:30000}, async () => {
  const original=process.env.PSExecutionPolicyPreference;
  const policy=async()=> (await exec(powershell,['-NoProfile','-NonInteractive','-Command',"Get-ExecutionPolicy -List | Where-Object {$_.Scope -ne 'Process'} | ConvertTo-Json -Compress"],{windowsHide:true,timeout:10000})).stdout.trim();
  const before=await policy();
  try {
    process.env.PSExecutionPolicyPreference='Restricted';
    const secret=randomBytes(32).toString('base64url');
    await assert.rejects(nativeInput('vault.ps1',{action:'protect',value:secret},{policyOverride:false}),e=>e.helper==='vault.ps1'&&e.exitCode===1&&e.category==='EXECUTION_POLICY'&&!e.message.includes(secret));
    const blob=await nativeInput('vault.ps1',{action:'protect',value:secret});
    assert.equal(await nativeInput('vault.ps1',{action:'unprotect',value:blob}),secret);
    await assert.rejects(nativeInput('vault.ps1',{action:'unprotect',value:'bad-base64'}),e=>e.helper==='vault.ps1'&&e.exitCode===1&&!e.message.includes('bad-base64'));
    assert.equal(await policy(),before);
  } finally { if(original===undefined)delete process.env.PSExecutionPolicyPreference;else process.env.PSExecutionPolicyPreference=original; }
});
