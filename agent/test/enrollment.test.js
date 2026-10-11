import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateEnrollment, AGENT_VERSION } from '../shared/contract.js';
import { createEnrollmentRequest, enroll } from '../src/enrollment.js';
import { Transport } from '../src/uploader.js';

test('shared enrollment schema identifies the failing field without echoing supplied values', () => {
  const token = randomBytes(32).toString('base64url');
  const valid = { token, platform: 'win32', agentVersion: AGENT_VERSION };
  assert.equal(validateEnrollment(valid), valid);
  assert.deepEqual(createEnrollmentRequest(`\uFEFF ${token}\r\n`, 'win32'), valid);
  for (const [body, field] of [[null,'payload'],[[], 'payload'],[{...valid,companyId:token},'payload'],[{...valid,token:`"${token}"`},'token'],[{...valid,token:{value:token}},'token'],[{...valid,platform:'Windows'},'platform'],[{...valid,agentVersion:''},'agentVersion'],[{...valid,agentVersion:token},'agentVersion']]) {
    assert.throws(() => validateEnrollment(body), error => {
      assert.equal(error.field, field); assert.match(error.code, /^ENROLLMENT_/);
      assert.ok(!error.message.includes(token)); return true;
    });
  }
  assert.throws(() => createEnrollmentRequest(`Enrollment token: ${token}`, 'win32'), /Copy only the token/);
});

test('agent preserves bounded sanitized backend errors, status, error code and correlation ID', async () => {
  const token = randomBytes(32).toString('base64url'), credential = randomBytes(32).toString('base64url'), requestId = randomUUID();
  const make = (status, body, contentType = 'application/json') => new Transport({serverUrl:'http://127.0.0.1:3000',allowLoopbackHttp:true}, credential,
    async () => new Response(body, {status,headers:{'Content-Type':contentType}}));
  await assert.rejects(make(400, JSON.stringify({success:false,error:'Copy only the enrollment token.',code:'ENROLLMENT_TOKEN_FORMAT',requestId})).post('enroll',{token}), error => {
    assert.equal(error.status,400); assert.equal(error.code,'ENROLLMENT_TOKEN_FORMAT'); assert.equal(error.requestId,requestId);
    assert.match(error.message,/Copy only/); return true;
  });
  await assert.rejects(make(401, JSON.stringify({error:{code:'TOKEN_EXPIRED',message:`Expired\n${token}; Bearer ${credential}`}})).post('enroll',{token}), error => {
    assert.equal(error.status,401); assert.equal(error.code,'TOKEN_EXPIRED');
    assert.ok(!error.message.includes(token));assert.ok(!error.message.includes(credential));assert.ok(!error.message.includes('\n'));return true;
  });
  for (const [body,type] of [['{invalid','application/json'],[JSON.stringify({error:credential.repeat(1000)}),'application/json'],[`<html>${token}</html>`,'text/html']]) {
    await assert.rejects(make(503,body,type).post('enroll',{token}), error => {
      assert.equal(error.status,503);assert.ok(error.message.length<150);assert.ok(!error.message.includes(token));assert.ok(!error.message.includes(credential));return true;
    });
  }
});

test('invalid input and orphaned local data cannot trigger exchange or overwrite state', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-enrollment-guard-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const originalFetch=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;throw new Error('Exchange must not be attempted');};
  t.after(()=>{global.fetch=originalFetch;});
  const dataDirectory=path.join(root,'data'),config={serverUrl:'http://127.0.0.1:3000',allowLoopbackHttp:true,dataDirectory};
  await assert.rejects(enroll(config,'not-a-token'),/Copy only the token/);
  await assert.rejects(fs.access(dataDirectory),{code:'ENOENT'});
  await fs.mkdir(dataDirectory);await fs.writeFile(path.join(dataDirectory,'credential.dpapi.tmp'),'partial protected state');
  await assert.rejects(enroll(config,randomBytes(32).toString('base64url')),/incomplete local data exists/);
  assert.equal(await fs.readFile(path.join(dataDirectory,'credential.dpapi.tmp'),'utf8'),'partial protected state');
  assert.equal(calls,0);
});
