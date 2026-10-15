import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inflateRawSync} from 'node:zlib';
import {architectures,commands,helpers,assertMachO,safeRelative,writeInventory,verifyKit,createZip} from '../packaging/macos/kit-lib.js';
import {updatePaths} from '../packaging/macos/update-user.js';
// Synthetic headers test package rejection logic only, never native functionality.
function syntheticMachO(arch) {const b=Buffer.alloc(32);b.writeUInt32LE(0xfeedfacf);b.writeUInt32LE(arch==='arm64'?0x0100000c:0x01000007,4);b.writeUInt32LE(2,12);return b;}
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'orbit-kit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(file,data='fixture')=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),data);};
  for(const file of [...commands,'README.txt','lib/employee-common.sh','lib/verify-kit.js','lib/kit-lib.js'])await write(file);
  await write('package.json',JSON.stringify({private:true,type:'module'}));
  await write('kit-manifest.json',JSON.stringify({format:1,kind:'employee-install',platform:'darwin',buildComplete:true,architectures,agentVersion:'1.1.0'}));
  for(const arch of architectures) {
    const p=`payloads/${arch}/`;
    await write(p+'package.json',JSON.stringify({version:'1.1.0'}));await write(p+'shared/contract.js',"export const AGENT_VERSION = '1.1.0';");
    for(const file of ['runtime/node',...helpers.map(h=>'native/'+h)])await write(p+file,syntheticMachO(arch));
    for(const file of ['src/cli.js','src/macos-user-install.js','src/service.js','packaging/macos/install-user.sh','packaging/macos/uninstall-user.sh','browser-companion/chromium/background.js','browser-companion/firefox/background.js'])await write(p+file);
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
test('employee kit refuses a missing or incompatible module configuration before enrollment',async t=>{
  const {root,write}=await fixture(t);
  await fs.unlink(path.join(root,'package.json'));await writeInventory(root);
  await assert.rejects(verifyKit(root,'arm64'),/Incomplete employee commands/);
  await write('package.json',JSON.stringify({type:'commonjs'}));await writeInventory(root);
  await assert.rejects(verifyKit(root,'arm64'),/ES module configuration/);
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
