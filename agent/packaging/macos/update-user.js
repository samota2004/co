import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {userContext,ownedPath} from '../../src/macos-user.js';
import {readConfig} from '../../src/config.js';
import {acquireUserLock} from '../../src/user-lock.js';
import {exec} from '../../src/native.js';
import {filesIn,validatePayload} from './kit-lib.js';

export function updatePaths(context,id) {
  if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid update transaction');
  const app=path.join(context.root,'app'),staged=path.join(context.root,`app.update-${id}`),backup=path.join(context.root,`app.previous-${id}`);
  for(const target of [app,staged,backup])if(path.dirname(target)!==context.root)throw new Error('Unsafe update path');
  return {app,staged,backup};
}
export async function main() {
  const context=userContext(),file=path.join(context.root,'config.json');
  await ownedPath(context.root,context.uid,{directory:true});await ownedPath(file,context.uid);
  const config=await readConfig(file);await ownedPath(config.dataDirectory,context.uid,{directory:true});
  const marker=await fs.readFile(path.join(config.dataDirectory,'enrollment-marker'),'utf8');
  if(marker!==config.expectedDeviceId)throw new Error('Enrollment marker does not match this installation; preserve data and contact the administrator');
  try{await fs.lstat(path.join(config.dataDirectory,'revoked'));throw new Error('Device revoked; update does not re-enroll devices');}catch(e){if(e.code!=='ENOENT')throw e;}
  const source=fileURLToPath(new URL('../../',import.meta.url)),pkg=JSON.parse(await fs.readFile(path.join(source,'package.json'),'utf8'));
  await filesIn(source);await validatePayload(source,context.arch,pkg.version);
  const {app,staged,backup}=updatePaths(context,randomUUID());await ownedPath(app,context.uid,{directory:true});
  const plist=path.join(context.home,'Library/LaunchAgents/com.cyberorbit.user-agent.plist');await ownedPath(plist,context.uid);
  for(const binary of ['native/keychain','runtime/node'])await ownedPath(path.join(app,binary),context.uid);
  await fs.mkdir(staged,{mode:0o700});
  for(const name of ['src','shared','native','runtime','packaging','browser-companion','package.json'])await fs.cp(path.join(source,name),path.join(staged,name),{recursive:true,force:false,errorOnExist:true});
  // Keep the exact installed Keychain helper and Node runtime. Their permanent
  // paths, Keychain ACL identity, credentials and the private data tree stay put.
  for(const binary of ['native/keychain','runtime/node'])await fs.copyFile(path.join(app,binary),path.join(staged,binary));
  const target=`gui/${context.uid}/com.cyberorbit.user-agent`,domain=`gui/${context.uid}`;
  let loaded=false;try{await exec('/bin/launchctl',['print',target],{timeout:5000});loaded=true;}catch{}
  if(loaded)await exec('/bin/launchctl',['bootout',target],{timeout:25000});
  let release;
  for(let i=0;i<20;i++) {try{release=await acquireUserLock(config.dataDirectory);break;}catch(e){if(i===19)throw e;await delay(500);}}
  let moved=false,swapped=false;
  try {
    await ownedPath(app,context.uid,{directory:true});await ownedPath(staged,context.uid,{directory:true});
    await fs.rename(app,backup);moved=true;await fs.rename(staged,app);swapped=true;
  } catch(error) {
    if(moved && !swapped)await fs.rename(backup,app);
    throw error;
  } finally {release();}
  // A restart failure preserves both app trees and all enrollment/queue state.
  // No reinstall, token exchange, credential deletion or config overwrite occurs.
  const since=Date.now();
  await exec('/bin/launchctl',['bootstrap',domain,plist],{timeout:10000});
  await exec('/bin/launchctl',['kickstart',target],{timeout:10000});
  console.log(`Agent code updated; previous application preserved at ${backup}. Enrollment and encrypted queue preserved.`);
  console.log('Waiting for a fresh authenticated heartbeat. Application usage still requires runtime/dashboard verification.');
  for(let i=0;i<45;i++) {
    try {
      const status=JSON.parse(await fs.readFile(path.join(config.dataDirectory,'heartbeat-status.json'),'utf8'));
      if(status.deviceId===config.expectedDeviceId && status.identity===context.identity && Date.parse(status.acknowledgedAt)>=since) {
        console.log('New service heartbeat acknowledged. Use an application for 35 seconds, then open Diagnose-Application-Usage.command and verify the new usage event in the dashboard.');return;
      }
    } catch{}
    await delay(1000);
  }
  throw new Error('Code update completed but no fresh heartbeat was verified. Preserve the installation and inspect logs; do not re-enroll.');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
