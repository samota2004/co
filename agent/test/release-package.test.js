import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import path from 'node:path';
import {AGENT_VERSION} from '../shared/contract.js';

// These tests inspect the actual release archives supplied by the build job;
// they never use ignored/stale extracted dist directories.
async function readZip(archivePath) {
  const bytes=await fs.readFile(archivePath);let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  assert.notEqual(eocd,-1,'ZIP end record is missing');
  const count=bytes.readUInt16LE(eocd+10),centralSize=bytes.readUInt32LE(eocd+12),centralOffset=bytes.readUInt32LE(eocd+16);
  assert.ok(centralOffset+centralSize<=eocd,'ZIP central directory bounds are invalid');
  const files=new Map();let p=centralOffset;
  for(let n=0;n<count;n++){
    assert.equal(bytes.readUInt32LE(p),0x02014b50,'ZIP central entry is invalid');
    const method=bytes.readUInt16LE(p+10),compressed=bytes.readUInt32LE(p+20),size=bytes.readUInt32LE(p+24),nameLen=bytes.readUInt16LE(p+28),extraLen=bytes.readUInt16LE(p+30),commentLen=bytes.readUInt16LE(p+32),local=bytes.readUInt32LE(p+42);
    const name=bytes.toString('utf8',p+46,p+46+nameLen).replaceAll('\\','/');assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'),`unsafe archive path ${name}`);
    p+=46+nameLen+extraLen+commentLen;
    if(name.endsWith('/'))continue;
    assert.equal(bytes.readUInt32LE(local),0x04034b50,'ZIP local entry is invalid');
    const ln=bytes.readUInt16LE(local+26),le=bytes.readUInt16LE(local+28),start=local+30+ln+le,packed=bytes.subarray(start,start+compressed);
    const content=method===0?Buffer.from(packed):method===8?zlib.inflateRawSync(packed):assert.fail(`unsupported ZIP method ${method}`);
    assert.equal(content.length,size,`bad uncompressed size for ${name}`);files.set(name,content);
  }
  return {files,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}
const windows=process.env.CYBERORBIT_RELEASE_WINDOWS_ARCHIVE;
const macos=process.env.CYBERORBIT_RELEASE_MACOS_ARCHIVE;

test('Windows release ZIP is valid, complete, source-versioned, and platform-scoped',{skip:!windows&&'No newly built Windows release archive supplied'},async()=>{
  const {files,sha256}=await readZip(windows);
  const required=['runtime/node.exe','CyberOrbitService.exe','packaging/windows/ServiceHost.cs','src/service.js','src/local-operation-auth.js','src/local-operation-client.js','src/remote-stop.js','src/macos-user.js','shared/contract.js','native/windows-api.cs','native/windows-snapshot.ps1','native/windows-desktop.ps1','native/windows-account-control.ps1','native/windows-usb-policy.ps1','native/windows-uninstall-schedule.ps1','native/vault.ps1','packaging/windows/install.ps1','packaging/windows/configure-startup.ps1','packaging/windows/request-operation.ps1','packaging/windows/uninstall.ps1','packaging/windows/update-installed.ps1','packaging/windows/update-source-files.ps1','packaging/windows/desktop-watchdog.ps1','package-manifest.json'];
  for(const name of required)assert.ok(files.has(name),`missing Windows package component ${name}; archive entries: ${[...files.keys()].slice(0,20).join(', ')}`);
  assert.ok(![...files.keys()].some(n=>/\.map$|(^|\/)(test|node_modules|\.git)(\/|$)|native\/(macos-|linux-)|packaging\/(macos|linux)\//i.test(n)),'development or other-platform file included');
  const manifest=JSON.parse(files.get('package-manifest.json').toString('utf8'));assert.equal(manifest.platform,'windows');assert.equal(manifest.packageVersion,AGENT_VERSION);assert.ok(manifest.builtAtUtc);assert.ok(/^[a-f0-9]{64}$/.test(sha256));
  for(const entry of manifest.files){const payload=files.get(entry.path);assert.ok(payload,`manifest file absent from ZIP: ${entry.path}`);assert.equal(crypto.createHash('sha256').update(payload).digest('hex'),entry.sha256,`checksum mismatch: ${entry.path}`);}
  assert.deepEqual([...files.keys()].filter(name=>name!=='package-manifest.json').sort(),manifest.files.map(entry=>entry.path).sort(),'manifest inventory covers every packaged file except its necessarily self-referential manifest');
  assert.match(files.get('packaging/windows/install.ps1').toString('utf8'),/0x2008D;;;BU/,'built-in Users retain query-only service access');
  assert.match(files.get('packaging/windows/request-operation.ps1').toString('utf8'),/SERVICE_STOP.*AGENT_UNINSTALL|AGENT_UNINSTALL.*SERVICE_STOP/s,'standard-user helper exposes only the two reviewable local operations');
  assert.match(files.get('packaging/windows/uninstall.ps1').toString('utf8'),/consume-local-operation-grant[\s\S]*AGENT_UNINSTALL/,'uninstaller checks the signed uninstall authorization');
  assert.match(files.get('src/local-operation-auth.js').toString('utf8'),/verifyLocalOperationGrant/);
  assert.match(files.get('native/windows-uninstall-schedule.ps1').toString('utf8'),/S-1-5-18/,'only LocalSystem schedules the authorized uninstall');
  const updater=files.get('packaging/windows/update-installed.ps1').toString('utf8');
  for(const relative of ['src/local-operation-auth.js','src/local-operation-client.js','native/windows-uninstall-schedule.ps1','packaging/windows/request-operation.ps1','packaging/windows/uninstall.ps1'])assert.ok(updater.includes(`'${relative}'`),`updater omits authorization workflow file ${relative}`);
});

test('macOS release ZIP is valid, checksummed, and excludes Windows-only components',{skip:!macos&&'No newly built macOS release archive supplied'},async()=>{
  const {files}=await readZip(macos);const names=[...files.keys()];
  assert.ok(!names.some(n=>/CyberOrbitService\.exe|runtime\/node\.exe|windows-usb-policy|packaging\/windows\//i.test(n)),'Windows-only file included in macOS ZIP');
  const packageManifestPath=names.find(n=>n.endsWith('package-manifest.json'));
  if(packageManifestPath){
    const packageManifest=JSON.parse(files.get(packageManifestPath).toString('utf8'));
    assert.equal(packageManifest.platform,'macos-build-kit');assert.equal(packageManifest.packageVersion,AGENT_VERSION);assert.ok(packageManifest.builtAtUtc);
    for(const entry of packageManifest.files){const content=files.get(`${packageManifestPath.slice(0,-'package-manifest.json'.length)}${entry.path}`);assert.ok(content,`manifest file missing: ${entry.path}`);assert.equal(crypto.createHash('sha256').update(content).digest('hex'),entry.sha256,`checksum mismatch: ${entry.path}`);}
    const prefix=packageManifestPath.slice(0,-'package-manifest.json'.length),checksumText=files.get(`${prefix}SHA256SUMS`).toString('utf8'),checksumRows=new Map(checksumText.trim().split('\n').map(line=>{const m=line.match(/^([a-f0-9]{64})  (.+)$/);assert.ok(m,'invalid macOS SHA256SUMS row');return [m[2],m[1]];}));
    assert.equal(checksumRows.size,packageManifest.files.length,'checksum inventory has missing or duplicate entries');
    for(const entry of packageManifest.files)assert.equal(checksumRows.get(entry.path),entry.sha256,`SHA256SUMS mismatch: ${entry.path}`);
    for(const fragment of ['Build-Mac-Install-Kit.command','README.txt','MACOS-VERIFICATION.md','build-kit-manifest.json','SHA256SUMS','runtime-archives/node-v22.23.3-darwin-arm64.tar.gz','runtime-archives/node-v22.23.3-darwin-x64.tar.gz','agent/native/macos-lock.swift','agent/native/macos-desktop.swift','agent/packaging/macos/install.sh','agent/packaging/macos/uninstall.sh','agent/packaging/macos/com.cyberorbit.agent.plist'])assert.ok(names.some(n=>n.endsWith(fragment)),`missing macOS build-kit component ${fragment}`);
    const buildManifestPath=names.find(n=>n.endsWith('build-kit-manifest.json'));const buildManifest=JSON.parse(files.get(buildManifestPath).toString('utf8'));assert.equal(buildManifest.platform,'darwin');assert.equal(buildManifest.employeeInstallable,false);assert.equal(buildManifest.agentVersion,AGENT_VERSION);
  }else{
    for(const fragment of ['install.sh','uninstall.sh','update.sh','Install-CYBERORBIT.command','Uninstall-CYBERORBIT.command','Update-CYBERORBIT.command','kit-manifest.json','payloads/arm64/runtime/node','payloads/x64/runtime/node','payloads/arm64/native/macos-lock','payloads/x64/native/macos-lock'])assert.ok(names.some(n=>n.endsWith(fragment)),`missing macOS package component ${fragment}`);
    const manifestFile=names.find(n=>n.endsWith('kit-manifest.json'));const manifest=JSON.parse(files.get(manifestFile).toString('utf8'));assert.equal(manifest.platform,'darwin');assert.equal(manifest.buildComplete,true);assert.equal(manifest.agentVersion,AGENT_VERSION);
  }
});
