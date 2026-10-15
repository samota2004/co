import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';
import {snapshot} from '../src/collectors/macos.js';
import {launchAgent,userContext} from '../src/macos-user.js';

const execute=promisify(execFile),mac=process.platform==='darwin';
async function compiled(t,name) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-mac-native-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const binary=path.join(directory,name);
  await execute('/usr/bin/xcrun',['swiftc',fileURLToPath(new URL(`../native/${name}.swift`,import.meta.url)),'-o',binary],{timeout:60000});
  return {directory,binary};
}
async function runInput(binary,input) {
  return new Promise((resolve,reject)=>{
    const child=spawn(binary,[],{stdio:['pipe','pipe','pipe']});let output='';
    const timer=setTimeout(()=>{child.kill();reject(new Error('Native test timed out'));},30000);
    child.stdout.on('data',b=>output+=b);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(new Error('Native test failed'));});
    child.stdin.end(JSON.stringify(input));
  });
}
test('real macOS process query sees this employee process and excludes other UIDs',{skip:!mac},async()=>{
  const observed=(await snapshot({processes:true,userOnly:true})).processes;
  assert.ok(observed.some(p=>p.pid===process.pid));
  assert.ok(observed.every(p=>p.identity===`uid:${process.getuid()}`));
});
test('real macOS Keychain stores, reloads and deletes an isolated test credential',{skip:!mac,timeout:90000},async t=>{
  const {binary}=await compiled(t,'keychain'),account=`CYBERORBIT automated test ${randomUUID()}`,value=JSON.stringify({fixture:randomUUID()});
  try {
  assert.equal(await runInput(binary,{action:'exists',account}),'false');
  await runInput(binary,{action:'set',account,value});
  assert.equal(await runInput(binary,{action:'get',account}),value);
  await runInput(binary,{action:'delete',account});
  assert.equal(await runInput(binary,{action:'exists',account}),'false');
  } finally {await runInput(binary,{action:'delete',account});}
});
test('real macOS flock excludes a duplicate instance and releases on parent EOF',{skip:!mac,timeout:90000},async t=>{
  const {directory,binary}=await compiled(t,'macos-lock'),file=path.join(directory,'test.lock');
  const first=spawn(binary,[file],{stdio:['pipe','pipe','pipe']});t.after(()=>first.kill());
  await new Promise((resolve,reject)=>{first.stdout.once('data',b=>b.toString().trim()==='locked'?resolve():reject(new Error('No lock')));first.once('error',reject);first.once('exit',()=>reject(new Error('Lock exited')));});
  await assert.rejects(execute(binary,[file],{timeout:5000}));
  const closed=new Promise(r=>first.once('close',r));first.stdin.end();await closed;
  const next=spawn(binary,[file],{stdio:['pipe','pipe','pipe']});
  const exited=new Promise((resolve,reject)=>{next.once('error',reject);next.once('close',code=>code===0?resolve():reject(new Error('Lock did not release')));});
  next.stdin.end();await exited;
});
test('real macOS desktop emits employee samples without unapproved titles and launchd parses generated paths',{skip:!mac,timeout:90000},async t=>{
  const {directory,binary}=await compiled(t,'macos-desktop');
  const plist=path.join(directory,'agent.plist');await fs.writeFile(plist,launchAgent(userContext()));
  await execute('/usr/bin/plutil',['-lint',plist],{timeout:5000});
  const child=spawn(binary,['--diagnostic-lock',path.join(directory,'desktop.lock')],{stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());
  child.stdin.write(JSON.stringify({browserTitles:false,proofs:[]})+'\n');
  const lines=readline.createInterface({input:child.stdout});
  const timer=setTimeout(()=>child.kill(),10000);t.after(()=>clearTimeout(timer));
  for await(const line of lines) {
    const sample=JSON.parse(line);assert.equal(sample.identity,`uid:${process.getuid()}`);
    assert.equal(sample.browserTitle,undefined);
    assert.ok(sample.kind==='desktop-status'||Number.isFinite(sample.idleMilliseconds));return;
  }
  assert.fail('No desktop sample; a logged-in GUI session is required');
});
test('real macOS AppKit receives enable controls and resolves an own active foreground application',{skip:!mac,timeout:90000},async t=>{
  const {binary,directory}=await compiled(t,'macos-desktop');
  const child=spawn(binary,['--diagnostic-lock',path.join(directory,'desktop.lock')],{stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());
  child.stderr.resume();
  const controls={activeApplication:true,browserTitles:false,proofs:[]};
  child.stdin.write(JSON.stringify(controls)+'\n');
  const timer=setTimeout(()=>child.kill(),12000);t.after(()=>clearTimeout(timer));
  let last;
  for await(const line of readline.createInterface({input:child.stdout})) {
    last=JSON.parse(line);child.stdin.write(JSON.stringify(controls)+'\n');
    if(!last.controlFresh || !last.controlActiveApplication)continue;
    assert.equal(last.helperRevision,2);assert.equal(last.identity,`uid:${process.getuid()}`);assert.equal(last.browserTitle,undefined);
    if(last.activityEligible && last.pid>0 && last.name && last.foregroundOwned && last.consoleActive) {
      assert.ok(['unknown','unlocked'].includes(last.sessionState));
      if(last.sessionState==='unknown')assert.equal(last.locked,undefined);
      return;
    }
  }
  assert.fail(`No enabled own foreground app in logged-in GUI session; status=${last?.foregroundStatus || 'no-sample'}, controls=${last?.controlActiveApplication===true}`);
});
