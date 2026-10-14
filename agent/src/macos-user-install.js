import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {userContext,ownedPath,launchAgent,macosFacts} from './macos-user.js';
import {readConfig} from './config.js';
import {enroll} from './enrollment.js';
import {exec} from './native.js';
import {CredentialStore} from './credential-store.js';
import {browserHosts} from './browser-native-host.js';
import {acquireUserLock} from './user-lock.js';
import {userRevoked} from './user-revocation.js';

export function continuationAction(hasCredential,entries) {
  if(entries.includes('revoked'))throw new Error('This device was revoked. Ask the administrator for a new assignment after authorized uninstall.');
  if(hasCredential)return 'start';
  if(entries.length)throw new Error('Incomplete enrollment data exists. Preserve it and ask the administrator to review it; do not enroll again.');
  return 'enroll';
}

const label='com.cyberorbit.user-agent';
const source=fileURLToPath(new URL('../',import.meta.url));
async function question(text) {
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{return (await rl.question(text)).trim();}finally{rl.close();}
}
export async function hiddenToken(input=process.stdin,output=process.stdout) {
  if(!input.isTTY || !input.setRawMode)throw new Error('Run enrollment in your own Terminal; the token prompt requires a TTY');
  output.write('Enrollment token (hidden): ');input.setRawMode(true);input.resume();
  return new Promise((resolve,reject)=>{
    let token='';
    const finish=(error)=>{input.off('data',onData);input.setRawMode(false);input.pause();output.write('\n');error?reject(error):resolve(token);};
    const onData=chunk=>{
      for(const c of chunk.toString('utf8')) {
        if(c==='\u0003')return finish(new Error('Enrollment cancelled'));
        if(c==='\r' || c==='\n')return finish();
        if(c==='\u007f' || c==='\b')token=token.slice(0,-1);
        else if(/[A-Za-z0-9_-]/.test(c))token+=c;
        else return finish(new Error('Paste only the enrollment token'));
        if(token.length>43)return finish(new Error('Enrollment token is too long'));
      }
    };input.on('data',onData);
  });
}
async function secureDirectory(directory,uid) {
  await fs.mkdir(directory,{recursive:true,mode:0o700});await ownedPath(directory,uid,{directory:true});await fs.chmod(directory,0o700);
}
async function writeConfig(file,config) {
  await fs.writeFile(file+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});await fs.rename(file+'.tmp',file);
}
async function validateTree(directory) {
  for(const item of await fs.readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,item.name);
    if(item.isSymbolicLink() || (!item.isFile()&&!item.isDirectory()))throw new Error('Distribution contains unsupported links or special files');
    if(item.isDirectory())await validateTree(file);
  }
}
async function start(context,config,{verifyHeartbeat=true}={}) {
  const agentDir=path.join(context.home,'Library','LaunchAgents');await secureDirectory(agentDir,context.uid);
  const plist=path.join(agentDir,label+'.plist');
  try{await ownedPath(plist,context.uid);}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.writeFile(plist,launchAgent(context),{mode:0o600});
  await exec('/usr/bin/plutil',['-lint',plist],{timeout:5000});
  const domain=`gui/${context.uid}`;
  await exec('/bin/launchctl',['enable',`${domain}/${label}`],{timeout:5000});
  try{await exec('/bin/launchctl',['print',`${domain}/${label}`],{timeout:5000});}
  catch{await exec('/bin/launchctl',['bootstrap',domain,plist],{timeout:10000});}
  const since=Date.now();await exec('/bin/launchctl',['kickstart','-k',`${domain}/${label}`],{timeout:10000});
  if(!verifyHeartbeat) {console.log('Local preference saved; LaunchAgent restarted. Offline telemetry remains queued.');return;}
  console.log('LaunchAgent registered. Waiting up to 45 seconds for an authenticated heartbeat...');
  for(let attempt=0;attempt<45;attempt++) {
    try {
      const status=JSON.parse(await fs.readFile(path.join(config.dataDirectory,'heartbeat-status.json'),'utf8'));
      if(Date.parse(status.acknowledgedAt)>=since && status.identity===context.identity && status.deviceId===config.expectedDeviceId) {
        console.log(`Authenticated heartbeat acknowledged at ${status.acknowledgedAt}. You may close Terminal.`);return;
      }
    }catch{}
    await delay(1000);
  }
  throw new Error('LaunchAgent registered, but no fresh authenticated heartbeat was verified. Enrollment is preserved. Run status and inspect logs; do not enroll again.');
}
const shQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
async function registerBrowser(context,config,file,browser,id) {
  const host=browserHosts[browser];
  if(!host || (browser==='firefox'?id!=='cyberorbit-companion@cyberorbit.local':!/^[a-p]{32}$/.test(id || '')))throw new Error('Use browser chrome|edge|brave|chromium with its extension ID, or firefox cyberorbit-companion@cyberorbit.local');
  const directory=path.join(context.home,'Library','Application Support',host.directory);
  await secureDirectory(directory,context.uid);
  const wrapper=path.join(context.root,`browser-${browser}.sh`);
  await fs.writeFile(wrapper,`#!/bin/sh\nunset NODE_OPTIONS NODE_PATH\nexec ${shQuote(path.join(context.root,'app/runtime/node'))} ${shQuote(path.join(context.root,'app/src/browser-native-host.js'))} ${shQuote(browser)} "$@"\n`,{mode:0o700,flag:'wx'});
  const manifest={name:'com.cyberorbit.browser',description:'CYBERORBIT approved normal-window title confirmation',path:wrapper,type:'stdio',
    ...(browser==='firefox'?{allowed_extensions:[id]}:{allowed_origins:[`chrome-extension://${id}/`]})};
  await fs.writeFile(path.join(directory,'com.cyberorbit.browser.json'),JSON.stringify(manifest,null,2),{mode:0o600,flag:'wx'});
  config.browserCompanions={...config.browserCompanions,[browser]:id};await writeConfig(file,config);
  console.log('Browser companion registered for this employee. Restart the extension/browser. Enable browser titles locally and in the dashboard.');
}
export async function main(args) {
  const context=userContext(),[command,...options]=args;
  const file=path.join(context.root,'config.json');
  if(command==='identity'){console.log(JSON.stringify(await macosFacts(context),null,2));return;}
  if(command==='install') {
    // A fresh destination only. Interrupted installations remain for explicit review.
    try{await fs.lstat(context.root);throw new Error('Installation already exists. Use enroll/start/status; do not overwrite existing data.');}catch(e){if(e.code!=='ENOENT')throw e;}
    try{await fs.lstat('/Library/CYBERORBIT/config.json');throw new Error('A root macOS deployment already exists. Ask your administrator to choose one deployment mode before installing a second agent.');}catch(e){if(e.code!=='ENOENT')throw e;}
    if(await question('CYBERORBIT will monitor this account’s applications, accessible processes, session state and explicitly approved folders. Optional normal-window browser titles may contain sensitive text. No passwords, keystrokes or page contents. You can pause or uninstall. Type MONITOR to consent: ')!=='MONITOR')throw new Error('Monitoring consent was not given');
    console.log(`Current account: ${context.username}; identity: ${context.identity}; host: ${context.hostname}; architecture: ${context.arch}`);
    const expectedDeviceId=await question('Assigned Mac device UUID from your administrator: ');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedDeviceId))throw new Error('A valid assigned device UUID is required');
    await validateTree(source);
    for(const binary of ['runtime/node','native/keychain','native/macos-desktop','native/macos-lock'])await fs.access(path.join(source,binary),fs.constants.X_OK);
    await fs.mkdir(context.root,{mode:0o700});await ownedPath(context.root,context.uid,{directory:true});
    const app=path.join(context.root,'app');await fs.mkdir(app,{mode:0o700});
    for(const name of ['src','shared','native','runtime','packaging','browser-companion','package.json'])await fs.cp(path.join(source,name),path.join(app,name),{recursive:true,errorOnExist:true,force:false});
    await secureDirectory(path.join(context.root,'logs'),context.uid);await secureDirectory(path.join(context.root,'data'),context.uid);
    const config={installMode:'user',serverUrl:'https://cyberorbit-backend.onrender.com',dataDirectory:path.join(context.root,'data'),
      desktopIdentity:context.identity,expectedDeviceId,browserTitles:false,locallyApprovedDirectories:[],paused:false,
      consent:{acceptedAt:new Date().toISOString(),disclosureVersion:1},unixAccountControl:{enabled:false}};
    await fs.writeFile(file,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log('Installed. Next, run the installed enroll command so Keychain trusts the permanent helper path.');return;
  }
  await ownedPath(context.root,context.uid,{directory:true});await ownedPath(file,context.uid);
  const config=await readConfig(file);
  if(command==='continue') {
    if(await userRevoked(config.dataDirectory))throw new Error('Device revoked; do not re-enroll. Contact your administrator.');
    const action=continuationAction(await new CredentialStore(config.dataDirectory).exists(),await fs.readdir(config.dataDirectory));
    if(action==='start')await start(context,config);
    else await main(['enroll']);
  } else if(command==='enroll') {
    if(path.resolve(source)!==path.join(context.root,'app'))throw new Error('Run enroll using the installed app/src/macos-user-install.js');
    await enroll(config,await hiddenToken());console.log('Enrollment stored in the user Keychain.');await start(context,config);
  } else if(command==='start') await start(context,config);
  else if(command==='permissions')console.log((await exec(path.join(context.root,'app/native/macos-desktop'),['--request-accessibility'],{timeout:10000})).stdout.trim());
  else if(command==='status') {
    const result=await exec('/bin/launchctl',['print',`gui/${context.uid}/${label}`],{timeout:5000});
    console.log(result.stdout);
    try{console.log(await fs.readFile(path.join(config.dataDirectory,'heartbeat-status.json'),'utf8'));}catch{console.log('No authenticated heartbeat recorded');}
  } else if(['pause','resume','titles-on','titles-off','approve-directory','remove-directory'].includes(command)) {
    if(command==='pause' || command==='resume')config.paused=command==='pause';
    if(command==='titles-on') {
      if(await question('Normal browser window titles may include sensitive page names or search terms. Type TITLES to approve local collection: ')!=='TITLES')throw new Error('Title consent was not given');
      config.browserTitles=true;
    }
    if(command==='titles-off')config.browserTitles=false;
    if(command==='approve-directory') {
      const directory=options[0];if(!directory || !path.isAbsolute(directory))throw new Error('Use an absolute folder path');
      const real=await fs.realpath(directory),relative=path.relative(context.home,real);
      if(!relative || relative.startsWith('..') || path.isAbsolute(relative) || real.startsWith(context.root))throw new Error('Approve a specific folder within your own home, outside agent storage');
      await ownedPath(real,context.uid,{directory:true});
      config.locallyApprovedDirectories=[...new Set([...config.locallyApprovedDirectories,real])];
      if(config.locallyApprovedDirectories.length>20)throw new Error('At most 20 approved folders');
    }
    if(command==='remove-directory')config.locallyApprovedDirectories=config.locallyApprovedDirectories.filter(p=>p!==path.resolve(options[0] || ''));
    await writeConfig(file,config);await start(context,config,{verifyHeartbeat:false});
  } else if(command==='browser')await registerBrowser(context,config,file,...options);
  else if(command==='uninstall') {
    if(await question('This stops monitoring and deletes this installation’s local queue and Keychain credential. Ask the administrator to revoke the device; server audit records remain. Type UNINSTALL: ')!=='UNINSTALL')throw new Error('Uninstall cancelled');
    const target=`gui/${context.uid}/${label}`;
    let loaded=false;try{await exec('/bin/launchctl',['print',target],{timeout:5000});loaded=true;}catch{}
    if(loaded)await exec('/bin/launchctl',['bootout',target],{timeout:20000});
    // Never remove another deployment or follow a replaced installation path.
    await ownedPath(context.root,context.uid,{directory:true});await ownedPath(config.dataDirectory,context.uid,{directory:true});
    const release=await acquireUserLock(config.dataDirectory);
    try {
    await new CredentialStore(config.dataDirectory).remove();
    for(const browser of Object.keys(config.browserCompanions || {})) {
      const host=browserHosts[browser];if(!host)continue;
      const manifest=path.join(context.home,'Library','Application Support',host.directory,'com.cyberorbit.browser.json');
      await ownedPath(manifest,context.uid);
      if(JSON.parse(await fs.readFile(manifest,'utf8')).path!==path.join(context.root,`browser-${browser}.sh`))throw new Error('Browser host was replaced; preserve and review it');
      await fs.unlink(manifest);
    }
    const plist=path.join(context.home,'Library','LaunchAgents',label+'.plist');
    try{await ownedPath(plist,context.uid);await fs.unlink(plist);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(context.root!==path.join(context.home,'Library','Application Support','CYBERORBIT'))throw new Error('Unsafe uninstall path');
    await fs.rm(context.root,{recursive:true});console.log('User agent removed. Revoke the assigned device in the dashboard and remove the browser companion extension.');
    } finally {release();}
  } else throw new Error('Commands: identity, install, continue, enroll, start, status, permissions, pause, resume, titles-on, titles-off, approve-directory PATH, remove-directory PATH, browser NAME EXTENSION_ID, uninstall');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
