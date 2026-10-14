import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {randomBytes} from 'node:crypto';
import {userContext,assertUserConfig,launchAgent} from '../src/macos-user.js';
import {parseProcesses} from '../src/collectors/macos.js';
import {effectiveConfig} from '../src/config.js';
import {UserDesktopSupervisor} from '../src/user-desktop-supervisor.js';
import {reconcileAccountControl} from '../src/account-control.js';
import {acceptBrowserProof,titleAllowed} from '../src/browser-privacy.js';
import {parseNativeMessages} from '../src/browser-native-host.js';
import {hiddenToken,continuationAction} from '../src/macos-user-install.js';
import {startIpc,sendSample} from '../src/ipc.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import vm from 'node:vm';
import {assertEnrollment,ownedPath} from '../src/macos-user.js';
import {EncryptedQueue} from '../src/queue.js';
import {userRevoked,markUserRevoked} from '../src/user-revocation.js';

test('user installation derives different identities and escaped launchd paths, rejects root and wrong enrollment',()=>{
  for(const [username,uid] of [['employee-a',501],['other.user',724],['Research & Design',1501]]) {
    const c=userContext({platform:'darwin',user:{username,uid,homedir:path.resolve('test-users',username)},arch:'arm64',hostname:'dynamic-host',release:'24.0'});
    const config={installMode:'user',desktopIdentity:`uid:${uid}`,dataDirectory:path.join(c.root,'data'),consent:{disclosureVersion:1,acceptedAt:new Date().toISOString()}};
    assert.equal(assertUserConfig(config,c),c);
    assert.throws(()=>assertUserConfig({...config,desktopIdentity:'uid:9001'},c));
    assert.throws(()=>assertUserConfig({...config,unixAccountControl:{enabled:true}},c));
    assert.throws(()=>assertUserConfig({...config,consent:undefined},c),/consent/);
    const plist=launchAgent(c);assert.ok(plist.includes('Aqua'));assert.ok(plist.includes('ThrottleInterval'));
    assert.ok(!plist.includes('/Library/LaunchDaemons'));assert.ok(!plist.includes('<key>UserName</key>'));
    if(username.includes('&'))assert.ok(plist.includes('Research &amp; Design'));
  }
  assert.throws(()=>userContext({platform:'darwin',user:{uid:0,homedir:path.resolve('root')}}));
  assert.throws(()=>userContext({platform:'linux',user:{uid:501,homedir:path.resolve('user')}}));
});
test('macOS process parser excludes other accounts and preserves accessible process identity',()=>{
  const raw=' 42 501 Wed Oct 14 10:00:00 2026 /Applications/TextEdit\n 43 724 Wed Oct 14 10:00:01 2026 /Applications/Other\n invalid\n 44 501 invalid date here ------ process';
  assert.deepEqual(parseProcesses(raw,501).map(p=>[p.pid,p.identity,p.name]),[[42,'uid:501','TextEdit']]);
  assert.equal(parseProcesses(raw).length,2);
});
test('user mode cannot enable privileged collection or account control, local pause overrides remote resume',async()=>{
  const c=effectiveConfig({usb:true,network:true,paused:false,browserTitles:true},{installMode:'user',paused:true,browserTitles:false,locallyApprovedDirectories:[]});
  assert.equal(c.usb,false);assert.equal(c.network,false);assert.equal(c.paused,true);assert.equal(c.browserTitles,false);
  const result=await reconcileAccountControl({installMode:'user',unixAccountControl:{enabled:true}}, {}, {},()=>{throw new Error('must not call native account control');},'darwin');
  assert.match(result,/unsupported/);
});
test('user helper supervision restarts only after backoff and stops on shutdown',async()=>{
  let now=0;const children=[],health={};
  const s=new UserDesktopSupervisor({dataDirectory:path.resolve('data')},health,{now:()=>now,start:(_file,args,options)=>{
    assert.equal(args[1],'helper');assert.equal(options.env.NODE_OPTIONS,'');
    const child=new EventEmitter();child.kill=()=>child.emit('close');children.push(child);return child;
  }});
  await s.tick();await s.tick();assert.equal(children.length,1);
  children[0].emit('close');await s.tick();assert.equal(children.length,1);
  now=16000;await s.tick();assert.equal(children.length,2);
  s.stop();now=50000;await s.tick();assert.equal(children.length,2);
});
test('browser privacy gate admits only fresh exact normal-window titles, fails closed for private, stale, missing or mismatched proof',()=>{
  const proofs=new Map(),s={appId:'com.google.Chrome',incognito:false,focused:true,title:'Public page'};
  assert.equal(acceptBrowserProof(proofs,s,10000),true);
  assert.equal(titleAllowed(proofs,{appId:s.appId,browserTitle:'Public page - Google Chrome'},11000),true);
  for(const [sample,time] of [[{appId:s.appId,browserTitle:'Private secret'},11000],[{appId:s.appId,browserTitle:'Public page'},14000],[{appId:'com.apple.Safari',browserTitle:'Public page'},11000]])assert.equal(titleAllowed(proofs,sample,time),false);
  assert.equal(acceptBrowserProof(proofs,{...s,incognito:true},12000),false);assert.equal(proofs.size,0);
  for(const bad of [{...s,focused:false},{...s,incognito:undefined},{...s,title:'a\nb'},{...s,title:'x'.repeat(257)}])assert.equal(acceptBrowserProof(proofs,bad),false);
});
test('browser native framing handles partial frames and refuses unbounded messages',()=>{
  const body=Buffer.from(JSON.stringify({incognito:false,title:'Public'})),header=Buffer.alloc(4);header.writeUInt32LE(body.length);
  const frame=Buffer.concat([header,body]);assert.equal(parseNativeMessages(frame.subarray(0,6)).messages.length,0);
  assert.equal(parseNativeMessages(frame).messages[0].title,'Public');assert.equal(parseNativeMessages(frame).rest.length,0);
  header.writeUInt32LE(4097);assert.throws(()=>parseNativeMessages(header));
});
test('enrollment prompt never echoes token and restores terminal mode on cancellation',async()=>{
  const input=new PassThrough(),output=new PassThrough();input.isTTY=true;const modes=[];input.setRawMode=x=>modes.push(x);
  let printed='';output.on('data',b=>printed+=b);
  const token=randomBytes(32).toString('base64url');const pending=hiddenToken(input,output);input.write(token+'\r');
  assert.equal(await pending,token);assert.ok(!printed.includes(token));assert.deepEqual(modes,[true,false]);
  const cancelled=hiddenToken(input,output);input.write('\u0003');await assert.rejects(cancelled,/cancelled/);assert.equal(modes.at(-1),false);
});
test('authenticated IPC separates user instances, rejects another identity and returns signed controls',async t=>{
  const key=randomBytes(32).toString('base64'),observed=[];
  const server=await startIpc({helperKey:key,mappedIdentity:'uid:724'},s=>observed.push(s),{port:0,controls:()=>({browserTitles:false,proofs:[]})});
  t.after(()=>server.close());const port=server.address().port,grant={key,identity:'uid:724'};
  const r=await sendSample(grant,{identity:'uid:724',kind:'browser-proof'},{port});assert.equal(r.browserTitles,false);
  await assert.rejects(sendSample(grant,{identity:'uid:501'},{port}));
  await assert.rejects(sendSample({...grant,key:randomBytes(32).toString('base64')},{identity:'uid:724'},{port}));
  assert.equal(observed.length,1);
});

test('stored enrollment validates both assigned device and dynamically discovered employee',()=>{
  const context=userContext({platform:'darwin',user:{username:'directory-user',uid:321,homedir:path.resolve('directory-user')}});
  const config={installMode:'user',desktopIdentity:context.identity,dataDirectory:path.join(context.root,'data'),expectedDeviceId:'assigned-device',consent:{disclosureVersion:1,acceptedAt:new Date().toISOString()}};
  const secrets={mappedIdentity:context.identity,deviceId:'assigned-device',credential:randomBytes(32).toString('base64url')};
  assert.doesNotThrow(()=>assertEnrollment(secrets,config,context));
  for(const wrong of [{...secrets,deviceId:'different-device'},{...secrets,mappedIdentity:'uid:501'},{...secrets,credential:''}])assert.throws(()=>assertEnrollment(wrong,config,context));
});
test('browser companion queries titles only after consent, excludes private windows and stops after denial',async()=>{
  let listener,queries=0,privateWindow=false;const sent=[];
  const event={addListener:()=>{}},port={onDisconnect:event,onMessage:{addListener:f=>listener=f},postMessage:v=>sent.push(v)};
  const chrome={runtime:{connectNative:()=>port},windows:{getLastFocused:(_opts,cb)=>cb({id:1,type:'normal',focused:true,incognito:privateWindow}),onFocusChanged:event},
    tabs:{query:(_opts,cb)=>{queries++;cb([{incognito:false,title:'Public fixture'}]);},onActivated:event,onUpdated:event},alarms:{create:()=>{},onAlarm:event}};
  const context=vm.createContext({chrome,Date,setInterval:()=>{}});
  vm.runInContext(await fs.readFile(new URL('../browser-companion/background.js',import.meta.url),'utf8'),context);
  assert.equal(queries,0);assert.equal(sent[0].kind,'control');
  listener({accepted:true,browserTitles:false});assert.equal(queries,0);
  vm.runInContext('observe()',context);listener({accepted:true,browserTitles:true});assert.equal(queries,1);assert.equal(sent.at(-1).title,'Public fixture');
  privateWindow=true;vm.runInContext('observe()',context);listener({accepted:true,browserTitles:true});assert.equal(queries,1);assert.equal(sent.at(-1).title,undefined);
  vm.runInContext('observe()',context);listener({accepted:true,browserTitles:false});assert.equal(queries,1);
});
test('encrypted macOS queue keeps stable IDs across restart and acknowledges duplicates once',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-mac-restart-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const key=randomBytes(32).toString('base64'),event={eventId:'fixture-id',occurredAt:new Date().toISOString(),metadata:{browserTitle:'Private local fixture text'}};
  const queue=await new EncryptedQueue(directory,key).init();await queue.append(event);await queue.append(event);
  assert.equal(queue.health().queueEvents,1);
  const recovered=await new EncryptedQueue(directory,key).init();assert.deepEqual(await recovered.batch(),[event]);
  assert.ok(!(await fs.readFile(path.join(directory,(await fs.readdir(directory)).find(f=>f.endsWith('.event'))))).includes(Buffer.from(event.metadata.browserTitle)));
  await recovered.acknowledge([event.eventId]);assert.equal(recovered.health().queueEvents,0);
});
test('Unix user storage refuses insecure files, wrong owner and links',{skip:process.platform==='win32'},async t=>{
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'orbit-user-path-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'config');await fs.writeFile(file,'{}',{mode:0o600});await ownedPath(file,process.getuid());
  await assert.rejects(ownedPath(file,process.getuid()+1));await fs.chmod(file,0o666);await assert.rejects(ownedPath(file,process.getuid()));
  await fs.chmod(file,0o600);await fs.link(file,path.join(root,'linked'));await assert.rejects(ownedPath(file,process.getuid()));
  await fs.unlink(path.join(root,'linked'));await fs.symlink(file,path.join(root,'symbolic'));await assert.rejects(ownedPath(path.join(root,'symbolic'),process.getuid()));
});
test('confirmed credential revocation persists across agent restarts',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-revoked-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  assert.equal(await userRevoked(directory),false);await markUserRevoked(directory);await markUserRevoked(directory);
  assert.equal(await userRevoked(directory),true);
});
test('double-click retry never consumes a new token for an existing or incomplete enrollment',()=>{
  assert.equal(continuationAction(false,[]),'enroll');
  assert.equal(continuationAction(true,['enrollment-marker','queue']),'start');
  assert.throws(()=>continuationAction(false,['queue']),/Incomplete/);
  assert.throws(()=>continuationAction(true,['revoked']),/revoked/);
});
