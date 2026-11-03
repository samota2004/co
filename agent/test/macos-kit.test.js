import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inflateRawSync} from 'node:zlib';
import {architectures,commands,helpers,assertMachO,safeRelative,buildTimestamp,writeInventory,verifyKit,createZip} from '../packaging/macos/kit-lib.js';
import {updatePaths,rollbackSwappedUpdate} from '../packaging/macos/update-user.js';
// Synthetic headers test package rejection logic only, never native functionality.
function syntheticMachO(arch) {const b=Buffer.alloc(32);b.writeUInt32LE(0xfeedfacf);b.writeUInt32LE(arch==='arm64'?0x0100000c:0x01000007,4);b.writeUInt32LE(2,12);return b;}
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-kit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(file,data='fixture')=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),data);};
  for(const file of [...commands,'README.txt','TROUBLESHOOTING.md','ADMINISTRATOR-GUIDE.md','lib/employee-common.sh','lib/verify-kit.js','lib/kit-lib.js'])await write(file);
  await write('package.json',JSON.stringify({private:true,type:'module'}));
  await write('kit-manifest.json',JSON.stringify({format:1,kind:'employee-install',platform:'darwin',buildComplete:true,architectures,agentVersion:'1.1.0',nodeVersion:'v22.23.3',minimumMacOS:'13.0'}));
  for(const arch of architectures) {
    const p=`payloads/${arch}/`;
    await write(p+'package.json',JSON.stringify({version:'1.1.0'}));await write(p+'shared/contract.js',"export const AGENT_VERSION = '1.1.0';");
    for(const file of ['runtime/node',...helpers.map(h=>'native/'+h)])await write(p+file,syntheticMachO(arch));
    for(const file of ['src/cli.js','src/macos-user-install.js','src/service.js','packaging/macos/USER-INSTALL.md','packaging/macos/install-user.sh','packaging/macos/uninstall-user.sh','packaging/macos/update-user.js','browser-companion/chromium/background.js','browser-companion/firefox/background.js'])await write(p+file);
  }
  return {root,write};
}
test('Mac package rejects Windows/ELF/source binaries, wrong CPU and unsafe paths',()=>{
  for(const arch of architectures)assert.doesNotThrow(()=>assertMachO(syntheticMachO(arch),arch));
  assert.throws(()=>assertMachO(syntheticMachO('x64'),'arm64'));
  for(const bytes of [Buffer.from('MZ Windows executable'),Buffer.from('import Foundation'),Buffer.from('\x7fELF')])assert.throws(()=>assertMachO(bytes,'arm64'));
  for(const file of ['../escape','/absolute','a/../escape','C:/escape','a\\b','a\nb'])assert.throws(()=>safeRelative(file));
});
test('user update paths stay beside app without targeting config, queue or enrollment state',()=>{
  const root=path.resolve('fixture-user','Library','Application Support','CYBERORBIT');
  const paths=updatePaths({root},'12345678-1234-1234-1234-123456789abc');
  for(const target of Object.values(paths)){assert.equal(path.dirname(target),root);assert.ok(!target.endsWith('config.json'));assert.ok(!target.endsWith('data'));}
  assert.throws(()=>updatePaths({root},'../data'));
  assert.ok(commands.includes('Update-CYBERORBIT.command'));assert.ok(commands.includes('Diagnose-Application-Usage.command'));
});
test('failed staged macOS update restores the prior app and retains failed app for diagnosis',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-update-rollback-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const {app,backup,failed}=updatePaths({root},'12345678-1234-1234-1234-123456789abc');
  await fs.mkdir(app,{mode:0o700});await fs.mkdir(backup,{mode:0o700});
  await fs.writeFile(path.join(app,'version.txt'),'new');await fs.writeFile(path.join(backup,'version.txt'),'previous');
  const commands=[];
  await rollbackSwappedUpdate({app,backup,failed,uid:process.getuid?.()??0,domain:'gui/501',target:'gui/501/com.cyberorbit.user-agent',plist:'/tmp/agent.plist',dataDirectory:root,
    run:async(_file,args)=>{commands.push(args[0]);},acquire:async()=>()=>commands.push('release'),sleep:async()=>{},validate:async()=>{}});
  assert.equal(await fs.readFile(path.join(app,'version.txt'),'utf8'),'previous');
  assert.equal(await fs.readFile(path.join(failed,'version.txt'),'utf8'),'new');
  assert.deepEqual(commands,['bootout','release','bootstrap','kickstart']);
});
test('kit verification requires both complete architecture payloads and detects changed/missing/unlisted files',async t=>{
  const {root,write}=await fixture(t);await writeInventory(root);assert.equal((await verifyKit(root,'arm64')).buildComplete,true);
  await write('payloads/x64/native/macos-lock','not a binary');await assert.rejects(verifyKit(root,'arm64'),/checksum/);
  await writeInventory(root);await assert.rejects(verifyKit(root,'arm64'),/macOS executable/);
  await write('payloads/x64/native/macos-lock',syntheticMachO('x64'));await writeInventory(root);
  await write('unexpected-file');await assert.rejects(verifyKit(root,'x64'),/unexpected/);
  await fs.unlink(path.join(root,'unexpected-file'));await fs.unlink(path.join(root,'payloads/x64/native/keychain'));await assert.rejects(verifyKit(root,'x64'));
});
test('build-only packages cannot pass the employee install gate',async t=>{
  const {root,write}=await fixture(t);await write('kit-manifest.json',JSON.stringify({format:1,kind:'macos-build',employeeInstallable:false}));await writeInventory(root);
  await assert.rejects(verifyKit(root,'arm64'),/not a complete built/);
});
test('employee payload rejects Windows packaging and root LaunchDaemon artifacts',async t=>{
  for(const forbidden of ['packaging/windows/install.ps1','native/windows-snapshot.ps1','packaging/macos/com.cyberorbit.agent.plist','packaging/macos/com.cyberorbit.desktop.plist']) {
    const {root,write}=await fixture(t);await write(`payloads/arm64/${forbidden}`);await writeInventory(root);
    await assert.rejects(verifyKit(root,'arm64'),/Employee package contains|Windows packaging or the optional root LaunchDaemon/);
  }
});
test('employee kit refuses a missing or incompatible module configuration before enrollment',async t=>{
  const {root,write}=await fixture(t);
  await fs.unlink(path.join(root,'package.json'));await writeInventory(root);
  await assert.rejects(verifyKit(root,'arm64'),/Incomplete employee commands/);
  await write('package.json',JSON.stringify({type:'commonjs'}));await writeInventory(root);
  await assert.rejects(verifyKit(root,'arm64'),/ES module configuration/);
});
test('employee package validator is a read-only clean-machine command and is mandatory in the package',()=>{
  assert.ok(commands.includes('Validate-CYBERORBIT-Package.command'));
  const script=fs.readFile(new URL('../packaging/macos/Validate-CYBERORBIT-Package.command',import.meta.url),'utf8');
  return script.then(source=>{
    assert.match(source,/employee-common\.sh/);
    assert.doesNotMatch(source,/macos-user-install\.js.*\b(install|enroll|uninstall)\b/);
  });
});
test('employee validation checks the host prerequisites and package hashes before any install command',async()=>{
  const common=await fs.readFile(new URL('../packaging/macos/employee-common.sh',import.meta.url),'utf8');
  assert.match(common,/sw_vers/);assert.match(common,/hw\.optional\.arm64/);assert.match(common,/verify-kit\.js/);
  assert.match(common,/launchctl print "gui\/\$\(/);
  assert.match(common,/nodeVersion/);
});
test('employee package rejects development files and invalid OS metadata even with a regenerated inventory',async t=>{
  const {root,write}=await fixture(t);await write('tests/debug.log');await writeInventory(root);
  await assert.rejects(verifyKit(root,'arm64'),/development, secret-like, Windows or root LaunchDaemon/);
  await fs.rm(path.join(root,'tests'),{recursive:true});await write('kit-manifest.json',JSON.stringify({format:1,kind:'employee-install',platform:'darwin',buildComplete:true,architectures,agentVersion:'1.1.0',nodeVersion:'v22.23.3',minimumMacOS:'12.0'}));await writeInventory(root);
  await assert.rejects(verifyKit(root,'arm64'),/minimum macOS/);
});
test('ZIP includes real deflated data and Unix execute permissions for double-click commands',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-zip-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'Kit');await fs.mkdir(root);const script='#!/bin/sh\necho CYBERORBIT\n';await fs.writeFile(path.join(root,'Install-CYBERORBIT.command'),script);
  const destination=path.join(directory,'Kit.zip');await createZip(root,destination);
  const bytes=await fs.readFile(destination);assert.equal(bytes.readUInt32LE(0),0x04034b50);
  const nameLength=bytes.readUInt16LE(26),size=bytes.readUInt32LE(18),start=30+nameLength;
  assert.equal(inflateRawSync(bytes.subarray(start,start+size)).toString(),script);
  const central=start+size;assert.equal(bytes.readUInt32LE(central),0x02014b50);assert.equal((bytes.readUInt32LE(central+38)>>>16)&0o777,0o755);
  assert.match(await fs.readFile(destination+'.sha256','utf8'),/^[a-f0-9]{64}  Kit.zip\n$/);
  await assert.rejects(createZip(root,destination),{code:'EEXIST'});
});
test('SOURCE_DATE_EPOCH makes package timestamps and archive bytes reproducible',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-reproducible-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'Kit');await fs.mkdir(root);await fs.writeFile(path.join(root,'README.txt'),'stable bytes\n');
  const prior=process.env.SOURCE_DATE_EPOCH;process.env.SOURCE_DATE_EPOCH='1760000000';
  try{
    assert.equal(buildTimestamp(),'2025-10-09T08:53:20.000Z');
    const first=path.join(directory,'one.zip'),second=path.join(directory,'two.zip');
    await createZip(root,first);await createZip(root,second);
    assert.deepEqual(await fs.readFile(first),await fs.readFile(second));
  }finally{if(prior===undefined)delete process.env.SOURCE_DATE_EPOCH;else process.env.SOURCE_DATE_EPOCH=prior;}
});
