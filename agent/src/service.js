import {isBrowser} from '../shared/app-identity.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CredentialStore } from './credential-store.js';
import { effectiveConfig } from './config.js';
import { EncryptedQueue } from './queue.js';
import {normalize} from './normalizer.js';
import {DesktopUsage,knownLock} from './desktop-usage.js';
import {desktopControls} from './desktop-control.js';
import { Transport, Uploader } from './uploader.js';
import { SystemCollectors } from './collectors/index.js';
import { FileCollector } from './collectors/files.js';
import { startIpc } from './ipc.js';
import { desktopSampleStatus, desktopDiagnosticStatus, heartbeatMetadata, healthReport } from './health.js';
import { AGENT_VERSION, DEFAULT_CONFIG } from '../shared/contract.js';
import { reconcileAccountControl } from './account-control.js';
import {UnixDesktopSupervisor} from './unix-desktop-supervisor.js';
import {UserDesktopSupervisor} from './user-desktop-supervisor.js';
import {assertUserConfig,assertEnrollment,ownedPath,macosFacts} from './macos-user.js';
import {acceptBrowserProof, titleAllowed} from './browser-privacy.js';
import {acquireUserLock} from './user-lock.js';
import {setTimeout as pause} from 'node:timers/promises';
import {userRevoked,markUserRevoked} from './user-revocation.js';
export async function runService(local) {
  if(local.installMode==='user') { const c=assertUserConfig(local);await ownedPath(local.dataDirectory,c.uid,{directory:true}); }
  if(local.installMode==='user') {
    const release=await acquireUserLock(local.dataDirectory);
    try{return await runEnrolledService(local);}finally{release();}
  }
  // Exclusive creation prevents simultaneous services from corrupting queue state.
  const lockPath=path.join(local.dataDirectory,'service.lock');
  try {const pid=Number(await fs.readFile(lockPath,'utf8'));try{process.kill(pid,0);throw new Error('Service already running');}catch(e){if(e.code!=='ESRCH') throw e;} await fs.unlink(lockPath);} catch(e) {if(e.code!=='ENOENT') throw e;}
  const lock=await fs.open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));await lock.close();
  // Credential/helper startup errors must release our lock too.
  try { await runEnrolledService(local); }
  finally { await fs.unlink(lockPath); }
}
async function runEnrolledService(local) {
  if(local.installMode==='user' && await userRevoked(local.dataDirectory)) {console.log('Device credential revoked; monitoring stopped. Contact the administrator before reinstalling.');return;}
  const secrets=await new CredentialStore(local.dataDirectory).load();
  if(local.installMode==='user') assertEnrollment(secrets,local);
  const queue=await new EncryptedQueue(path.join(local.dataDirectory,'queue'),secrets.queueKey,{uid:local.installMode==='user'?process.getuid():null}).init();
  const transport=new Transport(local,secrets.credential), uploader=new Uploader(queue,transport);
  let remote=DEFAULT_CONFIG;
  try {remote=JSON.parse(await fs.readFile(path.join(local.dataDirectory,'collector-config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  let config=effectiveConfig(remote,local), stopping=false, finalUsage=false, helperLastSeen=null, health={};
  const desktopStats={revision:2,samples:0,queuedUsage:0,lastQueuedUsage:null,lastSample:null};
  let lastDesktopLog='',lastDesktopLogAt=0,lastStatusWrite=0,statusSerial=Promise.resolve();
  const proofs=new Map();
  const emit=async(type,metadata)=> {
    if(local.installMode==='user' && metadata.identity && metadata.identity!==secrets.mappedIdentity) return;
    if((!stopping || (finalUsage && type==='APPLICATION_USAGE')) && !config.paused && !uploader.revoked) await queue.append(normalize(secrets.deviceId,type,metadata));
  };
  const collectors=new SystemCollectors(emit,health,local), files=new FileCollector((type,m)=>emit(type,local.installMode==='user'?{...m,identity:secrets.mappedIdentity}:m),health,{uid:local.installMode==='user'?process.getuid():null});
  const desktopSupervisor=local.installMode==='user'?new UserDesktopSupervisor(local,health):new UnixDesktopSupervisor(local,secrets.mappedIdentity,health);
  if(local.installMode==='user') {
    const facts=await macosFacts();
    health.installation=`user mode: ${facts.username} (${facts.identity}); ${facts.hostname}; macOS ${facts.osVersion}; ${facts.arch}`.slice(0,240);
  }
  const usageOptions=()=>({identity:secrets.mappedIdentity,activeApplication:config.activeApplication,sessions:config.sessions,browserTitles:config.browserTitles});
  const usage=new DesktopUsage(emit,{onUsage:record=>{desktopStats.queuedUsage++;desktopStats.lastQueuedUsage=record;}});
  const writeDesktopStatus=async(force=false)=>{
    if(local.installMode!=='user' || (!force && Date.now()-lastStatusWrite<15000))return;
    lastStatusWrite=Date.now();
    const status={...desktopStats,identity:secrets.mappedIdentity,deviceId:secrets.deviceId,updatedAt:new Date().toISOString(),
      requestedControls:desktopControls(config,{revoked:uploader.revoked,stopping}),desktopHealth:health.desktop,
      lastAcceptedUsage:uploader.lastAcceptedUsage || null,queue:queue.health()};
    const file=path.join(local.dataDirectory,'desktop-status.json');
    const task=statusSerial.then(async()=>{
      await fs.writeFile(file+'.tmp',JSON.stringify(status,null,2)+'\n',{mode:0o600});await fs.rename(file+'.tmp',file);
    });
    statusSerial=task.catch(()=>{console.error('CYBERORBIT desktop diagnostic snapshot unavailable; inspect data-directory permissions. Monitoring controls remain independent.');});
    await statusSerial;
  };
  const ipc=await startIpc(secrets,async s=> {
    if(stopping)return;
    if(s.kind==='browser-control' || s.kind==='desktop-control') return;
    if(s.kind==='browser-proof') {
      if(process.platform==='darwin' && config.browserTitles && !config.paused && !uploader.revoked) acceptBrowserProof(proofs,s);
      return;
    }
    if(config.paused || (!config.activeApplication && !config.sessions) || uploader.revoked) return;
    if(s.kind==='desktop-status') {
      const status=desktopDiagnosticStatus(s.status);if(!status)throw new Error('Invalid desktop diagnostic');
      helperLastSeen=new Date().toISOString();desktopSupervisor.observedAt=Date.now();health.desktop=status;
      await usage.finish(usageOptions());
      if(config.browserTitles)health.browserTitles='unavailable: foreground desktop query failed';
      return;
    }
    if(typeof s.sessionId!=='string' || s.sessionId.length>30 || typeof s.name!=='string' || s.name.length>256 || !Number.isSafeInteger(s.pid) || s.pid<0 || !Number.isFinite(s.idleMilliseconds) || s.idleMilliseconds<0) throw new Error('Invalid desktop sample');
    s.browserTitle=config.browserTitles && isBrowser(s) && typeof s.browserTitle==='string' ? s.browserTitle.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,256) : '';
    if(process.platform==='darwin' && s.browserTitle && (knownLock(s)!==false || !titleAllowed(proofs,s))) {s.browserTitle='';s.browserTitleStatus='privacy-unverified';}
    if(s.browserTitleStatus==='available' && !s.browserTitle)s.browserTitleStatus='unavailable';
    const now=Date.now();
    helperLastSeen=new Date(now).toISOString();
    desktopSupervisor.observedAt=now;
    health.desktop=desktopSampleStatus(s);
    desktopStats.samples++;
    desktopStats.lastSample={at:helperLastSeen,pid:s.pid,helperRevision:s.helperRevision || null,sessionState:s.sessionState || (typeof s.locked==='boolean'?(s.locked?'locked':'unlocked'):'unknown'),
      activeApplicationApplied:s.controlActiveApplication===true,controlFresh:s.controlFresh===true,consoleActive:s.consoleActive===true,
      foregroundStatus:typeof s.foregroundStatus==='string' && /^[a-z-]{1,40}$/.test(s.foregroundStatus)?s.foregroundStatus:null,
      foregroundSource:['none','frontmostApplication','activeRunningApplication'].includes(s.foregroundSource)?s.foregroundSource:null,
      foregroundOwned:s.foregroundOwned===true,activityEligible:s.activityEligible===true,idleMilliseconds:s.idleMilliseconds};
    if(process.platform==='darwin' && (lastDesktopLog!==health.desktop || now-lastDesktopLogAt>60000)) {
      lastDesktopLog=health.desktop;lastDesktopLogAt=now;
      console.log(`CYBERORBIT desktop: ${health.desktop}; activeApplication requested=${config.activeApplication===true} applied=${s.controlActiveApplication===true}; samples=${desktopStats.samples}; queuedUsage=${desktopStats.queuedUsage}`);
    }
    if(config.browserTitles && ['permission-required','available','unavailable','not-browser','privacy-unverified','privacy-unsupported','private-excluded','session-unverified'].includes(s.browserTitleStatus))health.browserTitles={
      'permission-required':'unavailable: grant Accessibility to desktop helper',available:'healthy: browser title observed',
      unavailable:'unavailable: browser did not expose a window title','not-browser':'enabled: no browser in foreground',
      'privacy-unverified':'unavailable: non-private window confirmation required (browser companion)',
      'privacy-unsupported':'unsupported: Safari private-window confirmation unavailable',
      'session-unverified':'unavailable: unlocked employee session not verified; titles excluded',
      'private-excluded':'excluded: private browser window'}[s.browserTitleStatus];
    await usage.sample(s,usageOptions());await writeDesktopStatus();
  },{...(local.installMode==='user'?{port:0}:{}),controls:()=>desktopControls(config,{revoked:uploader.revoked,stopping,proofs:[...proofs.values()].filter(p=>Date.now()-p.receivedAt<4000)})});
  if(local.installMode==='user') await fs.writeFile(path.join(local.dataDirectory,'ipc-port'),String(ipc.address().port),{mode:0o600});
  const shutdown=new AbortController();
  const sleep=ms=>pause(ms,undefined,{signal:shutdown.signal}).catch(e=>{if(e.name!=='AbortError')throw e;});
  const stop=()=>{stopping=true;shutdown.abort();ipc.close();files.close();desktopSupervisor.stop();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const revoke=async()=>{try{if(local.installMode==='user')await markUserRevoked(local.dataDirectory);}finally{stop();}};
  const collect=async()=> {
    let nextLogCheck=0;
    while(!stopping) {
      if(local.installMode==='user' && Date.now()>nextLogCheck) {
        nextLogCheck=Date.now()+60000;
        const log=path.join(path.dirname(local.dataDirectory),'logs','launchd.log');
        try {await ownedPath(log,process.getuid());if((await fs.stat(log)).size>5*1024*1024)await fs.truncate(log,0);}catch(e){if(e.code!=='ENOENT')health.logging='error: log ownership or rotation';}
      }
      if(!config.paused && !uploader.revoked) {await desktopSupervisor.tick();await collectors.poll(config);await files.configure(config.approvedDirectories);await usage.expire(usageOptions());}
      else {files.close();files.signature='';await usage.reset();proofs.clear();desktopSupervisor.suspend?.();health.desktop='disabled: paused or revoked';}
      if(local.installMode==='user') {health.usb='unsupported: device-wide source excluded in user mode';health.network='unsupported: device-wide source excluded in user mode';}
      if(!helperLastSeen || Date.now()-Date.parse(helperLastSeen)>15000) health.desktop=config.activeApplication?'unavailable: desktop helper not connected':'disabled';
      if(local.installMode==='user')health.sessionEvents=config.sessions?'partial: observed sessions; final logout delivery is best effort':'disabled';
      if(config.paused || !config.activeApplication)health.browserTitles='disabled: desktop monitoring paused';
      else if(!config.browserTitles)health.browserTitles='disabled: requires local and dashboard approval';
      else if(!helperLastSeen || Date.now()-Date.parse(helperLastSeen)>15000)health.browserTitles='unavailable: awaiting desktop helper';
      else if(!health.browserTitles || health.browserTitles.startsWith('disabled:'))health.browserTitles='enabled: requires updated desktop helper; titles only';
      await sleep(config.pollSeconds*1000);
    }
  };
  const upload=async()=> {while(!stopping){const before=uploader.lastAcceptedUsage?.eventId;await uploader.tick();if(uploader.lastAcceptedUsage?.eventId!==before)await writeDesktopStatus(true);if(uploader.revoked)await revoke();await sleep(1000);}};
  let accountControlReport=null;
  const heartbeat=async()=> {
    let failures=0;
    while(!stopping) {
      try {
        if(uploader.revoked) {await revoke();break;}
        await emit('HEARTBEAT',heartbeatMetadata());
        const r=await transport.post('heartbeat',{agentVersion:AGENT_VERSION,health:healthReport(queue,health,config,helperLastSeen),...(accountControlReport?{accountControlReport}:{})});
        accountControlReport=null;
        health.accountControl=await reconcileAccountControl(local,secrets,r.accountControl);
        const reported=/^reported: ([A-Z_]+)$/.exec(health.accountControl)?.[1];
        const resultCode=reported||(/^disabled:|^unsupported:/.test(health.accountControl)?'CONTROL_DISABLED':/^refused:/.test(health.accountControl)?'CONTROL_REFUSED':/^error:/.test(health.accountControl)?'NATIVE_ERROR':/^unchanged:/.test(health.accountControl)?'NEEDS_REVIEW':null);
        if(r.accountControl?.commandId&&resultCode)accountControlReport={commandId:r.accountControl.commandId,resultCode,reportedAt:new Date().toISOString()};
        if(process.platform==='win32')health.windowsAccount=health.accountControl;
        const next=effectiveConfig(r.config,local);
        if(next.paused || !next.activeApplication)await usage.reset();
        config=next;await fs.writeFile(path.join(local.dataDirectory,'collector-config.json.tmp'),JSON.stringify(r.config),{mode:0o600});
        await fs.rename(path.join(local.dataDirectory,'collector-config.json.tmp'),path.join(local.dataDirectory,'collector-config.json'));failures=0;
        if(local.installMode==='user') await fs.writeFile(path.join(local.dataDirectory,'heartbeat-status.json'),JSON.stringify({deviceId:secrets.deviceId,identity:secrets.mappedIdentity,acknowledgedAt:new Date().toISOString()}),{mode:0o600});
        await writeDesktopStatus();
      }catch(e){if(e.status===401 || e.status===403){uploader.revoked=true;await revoke();break;}failures++;}
      await sleep(failures?1000+Math.random()*Math.min(300000,1000*2**Math.min(failures,12)):30000);
    }
  };
  console.log('CYBERORBIT agent running; authorized employee monitoring enabled.');
  try {await Promise.all([collect(),upload(),heartbeat()]);} finally {
    stop();
    await ipc.drain();
    // Preserve already-observed partial usage on normal logout/restart, without
    // adding time after the last sample or collecting anything after revocation.
    if(!config.paused && !uploader.revoked) {finalUsage=true;try{await usage.finish(usageOptions());}finally{finalUsage=false;}}
    await writeDesktopStatus(true);
    await queue.serial;process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
}
