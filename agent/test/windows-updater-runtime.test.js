import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';

const agentRoot=fileURLToPath(new URL('../',import.meta.url));
const updaterPath=path.join(agentRoot,'packaging/windows/update-installed.ps1');
const normalize=value=>value.replaceAll('\\','/');

function updaterAllowlist(script){
  const match=script.match(/\$relativeFiles\s*=\s*@\(([\s\S]*?)\n\)/);
  assert.ok(match,'Windows updater must keep an explicit source allowlist');
  return [...match[1].matchAll(/'([^']+)'/g)].map(entry=>normalize(entry[1]));
}

async function collectImportClosure(entries){
  const pending=[...entries],seen=new Set();
  while(pending.length){
    const relative=pending.pop();
    if(seen.has(relative))continue;
    seen.add(relative);
    const source=await fs.readFile(path.join(agentRoot,...relative.split('/')),'utf8');
    for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)){
      const specifier=match[1];
      if(!specifier.startsWith('.')||!specifier.endsWith('.js'))continue;
      const resolved=normalize(path.posix.normalize(path.posix.join(path.posix.dirname(relative),specifier)));
      assert.ok(!resolved.startsWith('../'),`${relative} import escapes agent root`);
      pending.push(resolved);
    }
  }
  return seen;
}

function workerReady(installRoot){
  const source=`import {parentPort} from 'node:worker_threads';
import {runService} from './src/service.js';
import {readConfig} from './src/config.js';
import {runDesktopHelper} from './src/desktop-helper.js';
parentPort.postMessage({ready:typeof runService==='function'&&typeof readConfig==='function'&&typeof runDesktopHelper==='function'});`;
  const entry=path.join(installRoot,'runtime-import-smoke.mjs');
  return fs.writeFile(entry,source).then(()=>new Promise((resolve,reject)=>{
    let settled=false;
    const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);fn(value);};
    const worker=new Worker(entry,{execArgv:[]}),timer=setTimeout(()=>{void worker.terminate();finish(reject,new Error('staged service module worker timed out'));},10000);
    worker.once('message',message=>{void worker.terminate();finish(resolve,message);});
    worker.once('error',error=>finish(reject,error));
    worker.once('exit',code=>{if(code!==0)finish(reject,new Error(`staged service module worker exited ${code}`));});
  }));
}

test('Windows updater allowlist repairs an older install missing macos-user.js and starts the service module worker',{skip:process.platform!=='win32'},async()=>{
  const script=await fs.readFile(updaterPath,'utf8');
  const allowlist=updaterAllowlist(script);
  const closure=await collectImportClosure(['src/service.js','src/config.js','src/desktop-helper.js']);
  for(const dynamicCollector of ['src/collectors/windows.js','src/collectors/linux.js','src/collectors/macos.js'])closure.add(dynamicCollector);
  for(const relative of closure){
    assert.ok(allowlist.includes(relative),`Updater omits runtime dependency ${relative}`);
    await fs.access(path.join(agentRoot,...relative.split('/')));
  }
  for(const helper of ['src/cli.js','src/enrollment.js'])assert.ok(allowlist.includes(helper),`Updater omits runtime entry ${helper}`);
  for(const nativeDependency of ['native/vault.ps1','native/windows-snapshot.ps1','native/windows-desktop.ps1','native/windows-account-control.ps1','native/windows-api.cs']){
    assert.ok(allowlist.includes(nativeDependency),`Updater omits runtime support file ${nativeDependency}`);
  }

  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-updater-runtime-'));
  const installRoot=path.join(root,'Program Files','CYBERORBIT');
  const dataRoot=path.join(root,'ProgramData','CYBERORBIT');
  try{
    await fs.mkdir(installRoot,{recursive:true});
    await fs.mkdir(path.join(dataRoot,'queue'),{recursive:true});
    const protectedFixtures={
      'agent-config.json':{root:installRoot,value:'{"fixture":"configuration-preserved"}'},
      'credential.dpapi':{root:dataRoot,value:'synthetic-encrypted-credential-fixture'},
      'queue/0001.event':{root:dataRoot,value:'synthetic-queued-event-fixture'},
      'device-mapping.json':{root:dataRoot,value:'synthetic-device-mapping-fixture'}
    };
    for(const [relative,fixture] of Object.entries(protectedFixtures)){
      const destination=path.join(fixture.root,...relative.split('/'));
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await fs.writeFile(destination,fixture.value);
    }

    // Reproduce the older installed tree that lacks this module and confirm
    // the service imports fail exactly as the reported installed service did.
    for(const relative of allowlist){
      if(relative==='src/macos-user.js')continue;
      const source=path.join(agentRoot,...relative.split('/'));
      const destination=path.join(installRoot,...relative.split('/'));
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await fs.copyFile(source,destination);
    }
    await assert.rejects(workerReady(installRoot),error=>error.code==='ERR_MODULE_NOT_FOUND'&&/macos-user\.js/.test(error.message));

    // Run the exact source-file transaction used by update-installed.ps1,
    // against this temporary older installation only.
    const manifestPath=path.join(root,'update-sources.json');
    const runnerPath=path.join(root,'invoke-update-source-transaction.ps1');
    const backupRoot=path.join(root,'code-backup');
    await fs.writeFile(manifestPath,JSON.stringify(Object.fromEntries(allowlist.map(relative=>[
      relative,path.join(agentRoot,...relative.split('/'))
    ]))));
    await fs.writeFile(runnerPath,`param([string]$HelperPath,[string]$ManifestPath,[string]$InstallRoot,[string]$BackupRoot)
$ErrorActionPreference='Stop'
. $HelperPath
$manifest=Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$sources=@{}
foreach($property in $manifest.PSObject.Properties){$sources[$property.Name]=[string]$property.Value}
$state=@{Saved=@{};AclBefore=@{};CreatedTargets=@()}
Save-CyberOrbitUpdateFiles -Sources $sources -InstallRoot $InstallRoot -BackupRoot $BackupRoot -State $state
`);
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',runnerPath,
      path.join(agentRoot,'packaging/windows/update-source-files.ps1'),manifestPath,installRoot,backupRoot],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
    assert.equal((await fs.stat(path.join(installRoot,'src/macos-user.js'))).isFile(),true);
    assert.deepEqual(await workerReady(installRoot),{ready:true});
    for(const [relative,fixture] of Object.entries(protectedFixtures)){
      const file=path.join(fixture.root,...relative.split('/'));
      assert.equal(await fs.readFile(file,'utf8'),fixture.value,`${relative} was preserved by the updater transaction`);
    }
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
