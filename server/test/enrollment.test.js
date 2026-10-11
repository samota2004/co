import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { deviceFixture, projectRoot } from './device-fixture.js';
import { EndpointService, hashSecret } from '../services/endpoint-service.js';
import { endpointRequestContext, endpointPayloadError } from '../middleware/endpoint-errors.js';
import { CredentialStore } from '../../agent/src/credential-store.js';
import { powershell } from '../../agent/src/native.js';
import { AGENT_VERSION } from '../../agent/shared/contract.js';

async function windowsCli(configFile, token) {
  // Same Windows PowerShell SecureString/BSTR/native stdin path as install.ps1.
  // Token is never an argument, command interpolation, log or environment value.
  const script = "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()) -AsPlainText -Force; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {$t=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p); $t | & $env:CYBERORBIT_TEST_NODE $env:CYBERORBIT_TEST_CLI enroll $env:CYBERORBIT_TEST_CONFIG; exit $LASTEXITCODE} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p);$s.Dispose();$t=$null}";
  return new Promise((resolve,reject) => {
    const child = spawn(powershell,['-NoProfile','-NonInteractive','-Command',script],{
      windowsHide:true,stdio:['pipe','pipe','pipe'],
      env:{...process.env,CYBERORBIT_TEST_NODE:process.execPath,CYBERORBIT_TEST_CLI:path.join(process.env.CYBERORBIT_TEST_AGENT_ROOT || path.join(projectRoot,'agent'),'src/cli.js'),CYBERORBIT_TEST_CONFIG:configFile},
    });
    let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(new Error('CLI enrollment timeout'));},30000);
    child.stdout.on('data',chunk=>{stdout+=chunk;});child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});child.stdin.end(token);
  });
}

test('enrollment schema errors, token states, single-use exchange and actual Windows installer stdin', {skip:!process.env.DATABASE_URL,timeout:90000}, async () => {
  const f=await deviceFixture();let server,sse,temp;
  const logs=[],originalWarn=console.warn,secrets=[];
  console.warn=(...args)=>logs.push(args.join(' '));
  try {
    const {default:router}=await import('../routes/endpoint.js');sse=(await import('../services/sse.js')).sseManager;
    const app=express();app.use('/api/endpoint',endpointRequestContext,express.json({limit:'256kb'}),endpointPayloadError,router);
    server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const origin=`http://127.0.0.1:${server.address().port}`;
    const service=new EndpointService(f.prisma);
    const assignment=async(name,platform='win32')=>{const a=await service.assign(f.admin,{userId:f.employee.id,name,platform});secrets.push(a.enrollmentToken);return a;};
    const call=async(body)=>{const r=await fetch(`${origin}/api/endpoint/enroll`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,data:await r.json(),headers:r.headers};};
    const request=token=>({token,platform:'win32',agentVersion:AGENT_VERSION});
    const pending=await assignment('Schema validation');
    let result=await call(request(`Enrollment token: ${pending.enrollmentToken}`));
    assert.equal(result.status,400);assert.equal(result.data.code,'ENROLLMENT_TOKEN_FORMAT');assert.match(result.data.error,/exactly 43/);
    assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(result.headers.get('x-request-id'),result.data.requestId);
    assert.ok(logs.some(log=>log.includes('"field":"token"')&&log.includes('"reason":"invalid_format"')));
    assert.equal((await f.prisma.endpointDevice.findUnique({where:{id:pending.deviceId}})).enrollmentHash,hashSecret(pending.enrollmentToken));
    result=await call({...request(pending.enrollmentToken),platform:'linux'});assert.equal(result.status,400);assert.equal(result.data.code,'ENROLLMENT_PLATFORM_MISMATCH');
    const malformed=await fetch(`${origin}/api/endpoint/enroll`,{method:'POST',headers:{'Content-Type':'application/json'},body:`{"token":"${pending.enrollmentToken}"`});
    assert.equal(malformed.status,400);assert.equal((await malformed.json()).code,'ENDPOINT_JSON_INVALID');
    const large=await fetch(`${origin}/api/endpoint/enroll`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:pending.enrollmentToken,padding:'x'.repeat(270000)})});
    assert.equal(large.status,413);assert.equal((await large.json()).code,'ENDPOINT_PAYLOAD_TOO_LARGE');
    const expired=await assignment('Expired token');await f.prisma.endpointDevice.update({where:{id:expired.deviceId},data:{enrollmentExpiresAt:new Date(0)}});
    result=await call(request(expired.enrollmentToken));assert.equal(result.status,401);assert.equal(result.data.code,'ENROLLMENT_TOKEN_EXPIRED');
    const revoked=await assignment('Revoked token');await service.change(f.admin,revoked.deviceId,{},true);
    result=await call(request(revoked.enrollmentToken));assert.equal(result.status,401);assert.equal(result.data.code,'ENROLLMENT_TOKEN_UNAVAILABLE');
    await f.prisma.user.update({where:{id:f.employee.id},data:{status:'DISABLED'}});
    result=await call(request(pending.enrollmentToken));assert.equal(result.status,401);assert.equal(result.data.code,'ENROLLMENT_ASSIGNMENT_INVALID');
    await f.prisma.user.update({where:{id:f.employee.id},data:{status:'ACTIVE'}});
    result=await call(request(randomBytes(32).toString('base64url')));assert.equal(result.status,401);assert.equal(result.data.code,'ENROLLMENT_TOKEN_UNAVAILABLE');
    const actual=await assignment('Actual Windows stdin');
    let credential;
    if(process.platform==='win32') {
      temp=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-enrollment-'));
      const configFile=path.join(temp,'agent-config.json'),dataDirectory=path.join(temp,'data');
      await fs.writeFile(configFile,JSON.stringify({serverUrl:origin,allowLoopbackHttp:true,dataDirectory,locallyApprovedDirectories:[]}));
      const cli=await windowsCli(configFile,actual.enrollmentToken);assert.equal(cli.code,0,cli.stderr);
      assert.equal(JSON.parse(cli.stdout).deviceId,actual.deviceId);assert.ok(!('credential' in JSON.parse(cli.stdout)));
      credential=(await new CredentialStore(dataDirectory).load()).credential;
      assert.equal((await fs.readFile(path.join(dataDirectory,'enrollment-marker'),'utf8')),actual.deviceId);
      const repeat=await windowsCli(configFile,actual.enrollmentToken);assert.equal(repeat.code,1);assert.match(repeat.stderr,/Already enrolled/);
      assert.ok(!cli.stdout.includes(actual.enrollmentToken));assert.ok(!cli.stdout.includes(credential));
    } else {
      result=await call({...request(actual.enrollmentToken),platform:'win32'});assert.equal(result.status,200);credential=result.data.credential;
    }
    secrets.push(credential);
    const saved=await f.prisma.endpointDevice.findUnique({where:{id:actual.deviceId}});assert.equal(saved.credentialHash,hashSecret(credential));assert.equal(saved.agentVersion,AGENT_VERSION);assert.equal(saved.enrollmentHash,null);
    result=await call(request(actual.enrollmentToken));assert.equal(result.status,401);assert.equal(result.data.code,'ENROLLMENT_TOKEN_UNAVAILABLE');
    const race=await assignment('Single-use concurrency');
    const raced=await Promise.all([call(request(race.enrollmentToken)),call(request(race.enrollmentToken))]);assert.deepEqual(raced.map(r=>r.status).sort(),[200,401]);
    for(const secret of secrets)assert.ok(!logs.join('\n').includes(secret),'Logs must not contain enrollment tokens or device credentials');
    assert.ok(logs.every(log=>!log.includes('enrollmentHash')&&!log.includes('credentialHash')));
    console.log('Verified actual enrollment field errors, JSON limits, expiry, revoked/used tokens, inactive assignment, single-use races and Windows SecureString/stdin/DPAPI exchange.');
  } finally {
    console.warn=originalWarn;if(sse)clearInterval(sse.heartbeatInterval);
    if(server)await new Promise(resolve=>server.close(resolve));await f.close();
    if(temp&&path.dirname(temp)===os.tmpdir())await fs.rm(temp,{recursive:true,force:true});
  }
});
