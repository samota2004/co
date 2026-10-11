import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exec, powershell, nativeInput, windowsHelperArguments, nativeErrorCategory } from '../src/native.js';
import { snapshot } from '../src/collectors/windows.js';
import { CredentialStore } from '../src/credential-store.js';
import { startIpc, sendSample } from '../src/ipc.js';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { nativeDirectory } from '../src/native.js';
test('Windows actual CIM/WTS/USB/TCP snapshots and machine DPAPI roundtrip',{skip:process.platform!=='win32',timeout:120000},async t=>{
  const p=await snapshot({processes:true});assert.ok(p.processes.some(p=>p.pid===process.pid));assert.ok(p.processes.find(p=>p.pid===process.pid).identity?.startsWith('S-1-5-'));
  assert.ok(Array.isArray((await snapshot({sessions:true})).sessions));assert.ok(Array.isArray((await snapshot({usb:true})).usb));assert.ok(Array.isArray((await snapshot({network:true})).network));
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-vault-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const s=new CredentialStore(dir),secret={credential:randomBytes(32).toString('base64')};await s.save(secret);assert.deepEqual(await s.load(),secret);
  assert.ok(!(await fs.readFile(path.join(dir,'credential.dpapi'),'utf8')).includes(secret.credential));
});
test('real Windows desktop helper reads foreground/idle/lock without window contents',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const p=spawn(powershell,windowsHelperArguments('windows-desktop.ps1'),{windowsHide:true,stdio:['ignore','pipe','pipe']});
  p.stderr.resume();
  const timer=setTimeout(()=>p.kill(),20000);
  let sample;
  try {for await(const line of readline.createInterface({input:p.stdout})){sample=JSON.parse(line);break;}}
  finally {clearTimeout(timer);p.kill();}
  assert.ok(sample?.identity.startsWith('S-1-5-'));assert.equal(typeof sample.locked,'boolean');assert.ok(Number.isInteger(sample.pid));assert.ok(Number.isFinite(sample.idleMilliseconds));assert.ok(!('title' in sample));
});
test('local desktop channel authenticates both directions and rejects wrong identity/key',{timeout:15000},async t=>{
  const secrets={helperKey:randomBytes(32).toString('base64'),mappedIdentity:'uid:1000'};let samples=0;
  const server=await startIpc(secrets,async()=>{samples++;},{port:0});t.after(()=>new Promise(r=>server.close(r)));
  const options={port:server.address().port};
  const grant={key:secrets.helperKey,identity:secrets.mappedIdentity};await sendSample(grant,{identity:grant.identity},options);assert.equal(samples,1);
  await assert.rejects(sendSample({...grant,key:randomBytes(32).toString('base64')},{identity:grant.identity},options));
  await assert.rejects(sendSample(grant,{identity:'uid:2000'},options));assert.equal(samples,1);
});
test('Windows desktop collector rejects duplicates and releases ownership after exit',{skip:process.platform!=='win32',timeout:60000},async t=>{
  const launch=()=>{
    const child=spawn(powershell,[...windowsHelperArguments('windows-desktop.ps1'),'-Exclusive'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stderr='';child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-8192);});
    const closed=new Promise(resolve=>child.once('close',resolve));
    t.after(async()=>{if(child.exitCode===null)child.kill();await closed;});
    const sample=new Promise((resolve,reject)=>{
      const lines=readline.createInterface({input:child.stdout});
      const timer=setTimeout(()=>{child.kill();reject(new Error('Desktop sample timed out'));},20000);
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('close',()=>{clearTimeout(timer);reject(new Error(nativeErrorCategory(stderr)));});
      lines.once('line',line=>{clearTimeout(timer);try{resolve(JSON.parse(line));}catch(e){reject(e);}});
    });
    return {child,closed,sample};
  };
  const first=launch();
  try {assert.equal(typeof (await first.sample).locked,'boolean');}
  catch(e){if(e.message==='HELPER_ALREADY_RUNNING'){t.skip('The installed collector already owns this session');return;}throw e;}
  await assert.rejects(exec(powershell,[...windowsHelperArguments('windows-desktop.ps1'),'-Exclusive'],{timeout:15000,windowsHide:true}),e=>nativeErrorCategory(e.stderr)==='HELPER_ALREADY_RUNNING');
  first.child.kill();await first.closed;
  assert.equal(typeof (await launch().sample).locked,'boolean');
});
