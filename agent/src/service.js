import {isBrowser} from '../shared/app-identity.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CredentialStore } from './credential-store.js';
import { effectiveConfig } from './config.js';
import { EncryptedQueue } from './queue.js';
import { normalize, desktopAppMetadata, desktopAppChanged, foregroundObserved } from './normalizer.js';
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
  let config=effectiveConfig(remote,local), stopping=false, helperLastSeen=null, health={}, helperStates=new Map();
  const proofs=new Map();
  const emit=async(type,metadata)=> {
    if(local.installMode==='user' && metadata.identity && metadata.identity!==secrets.mappedIdentity) return;
    if(!stopping && !config.paused && !uploader.revoked) await queue.append(normalize(secrets.deviceId,type,metadata));
  };
  const collectors=new SystemCollectors(emit,health,local), files=new FileCollector((type,m)=>emit(type,local.installMode==='user'?{...m,identity:secrets.mappedIdentity}:m),health,{uid:local.installMode==='user'?process.getuid():null});
  const desktopSupervisor=local.installMode==='user'?new UserDesktopSupervisor(local,health):new UnixDesktopSupervisor(local,secrets.mappedIdentity,health);
  if(local.installMode==='user') {
    const facts=await macosFacts();
    health.installation=`user mode: ${facts.username} (${facts.identity}); ${facts.hostname}; macOS ${facts.osVersion}; ${facts.arch}`.slice(0,240);
  }
  const flush=async state => {
    if(state.duration>0 && state.name) await emit('APPLICATION_USAGE',{identity:secrets.mappedIdentity,sessionId:state.sessionId,pid:state.pid,name:state.name,durationSeconds:Math.round(state.duration*100)/100,...desktopAppMetadata(state),...(config.browserTitles && state.browserTitle?{browserTitle:state.browserTitle}:{})});
    state.duration=0;
  };
  const ipc=await startIpc(secrets,async s=> {
    if(stopping)return;
    if(s.kind==='browser-control') return;
    if(s.kind==='browser-proof') {
      if(process.platform==='darwin' && config.browserTitles && !config.paused && !uploader.revoked) acceptBrowserProof(proofs,s);
      return;
    }
    if(config.paused || (!config.activeApplication && !config.sessions) || uploader.revoked) return;
    if(s.kind==='desktop-status') {
      const status=desktopDiagnosticStatus(s.status);if(!status)throw new Error('Invalid desktop diagnostic');
      helperLastSeen=new Date().toISOString();desktopSupervisor.observedAt=Date.now();health.desktop=status;
      if(config.browserTitles)health.browserTitles='unavailable: foreground desktop query failed';
      return;
    }
    if(typeof s.sessionId!=='string' || s.sessionId.length>30 || typeof s.name!=='string' || s.name.length>256 || !Number.isSafeInteger(s.pid) || s.pid<0 || !Number.isFinite(s.idleMilliseconds) || s.idleMilliseconds<0) throw new Error('Invalid desktop sample');
    s.browserTitle=config.browserTitles && isBrowser(s) && typeof s.browserTitle==='string' ? s.browserTitle.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,256) : '';
    if(process.platform==='darwin' && s.browserTitle && !titleAllowed(proofs,s)) {s.browserTitle='';s.browserTitleStatus='privacy-unverified';}
    if(s.browserTitleStatus==='available' && !s.browserTitle)s.browserTitleStatus='unavailable';
    const now=Date.now(), prior=helperStates.get(s.sessionId);
    if(!prior && helperStates.size>100) throw new Error('Session capacity reached');
    helperLastSeen=new Date(now).toISOString();
    desktopSupervisor.observedAt=now;
    health.desktop=desktopSampleStatus(s);
    if(s.sessionStatus==='lock-state-unavailable')health.desktop='degraded: OS lock indicator unavailable; lock/unlock events excluded';
    if(config.browserTitles && ['permission-required','available','unavailable','not-browser','privacy-unverified','privacy-unsupported','private-excluded'].includes(s.browserTitleStatus))health.browserTitles={
      'permission-required':'unavailable: grant Accessibility to desktop helper',available:'healthy: browser title observed',
      unavailable:'unavailable: browser did not expose a window title','not-browser':'enabled: no browser in foreground',
      'privacy-unverified':'unavailable: non-private window confirmation required (browser companion)',
      'privacy-unsupported':'unsupported: Safari private-window confirmation unavailable',
      'private-excluded':'excluded: private browser window'}[s.browserTitleStatus];
    if(config.activeApplication && foregroundObserved(prior,s,now)) await emit('APPLICATION_FOREGROUND',{identity:secrets.mappedIdentity,sessionId:s.sessionId,pid:s.pid,name:s.name,...desktopAppMetadata(s)});
    if(!prior && config.sessions && typeof s.locked==='boolean')await emit('SESSION_STATE',{identity:secrets.mappedIdentity,sessionId:s.sessionId,state:s.locked?'locked':'unlocked'});
    if(prior) {
      // Bound gaps: a crashed/offline helper cannot invent hours of usage.
      if(config.activeApplication && now-prior.time<=5000 && prior.locked!==true && prior.idleMilliseconds<60000 && s.locked!==true && s.idleMilliseconds<60000) prior.duration+=(now-prior.time)/1000;
      if(desktopAppChanged(prior,s) || s.locked===true || prior.duration>=30) await flush(prior);
      if(typeof s.locked==='boolean' && typeof prior.locked==='boolean' && s.locked!==prior.locked && config.sessions) await emit(s.locked?'SESSION_LOCK':'SESSION_UNLOCK',{identity:secrets.mappedIdentity,sessionId:s.sessionId,state:s.locked?'locked':'unlocked'});
    }
    helperStates.set(s.sessionId,{...s,time:now,duration:prior?.duration || 0});
  },{...(local.installMode==='user'?{port:0}:{}),controls:()=>({browserTitles:config.browserTitles && config.activeApplication && !config.paused && !uploader.revoked,
    activeApplication:config.activeApplication && !config.paused && !uploader.revoked,
    proofs:config.browserTitles && config.activeApplication && !config.paused && !uploader.revoked?[...proofs.values()].filter(p=>Date.now()-p.receivedAt<4000):[]})});
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
      if(!config.paused && !uploader.revoked) {await desktopSupervisor.tick();await collectors.poll(config);await files.configure(config.approvedDirectories);}
      else {files.close();files.signature='';helperStates.clear();proofs.clear();desktopSupervisor.suspend?.();health.desktop='disabled: paused or revoked';}
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
  const upload=async()=> {while(!stopping){await uploader.tick();if(uploader.revoked)await revoke();await sleep(1000);}};
  const heartbeat=async()=> {
    let failures=0;
    while(!stopping) {
      try {
        if(uploader.revoked) {await revoke();break;}
        await emit('HEARTBEAT',heartbeatMetadata());
        const r=await transport.post('heartbeat',{agentVersion:AGENT_VERSION,health:healthReport(queue,health,config,helperLastSeen)});
        health.accountControl=await reconcileAccountControl(local,secrets,r.accountControl);
        if(process.platform==='win32')health.windowsAccount=health.accountControl;
        config=effectiveConfig(r.config,local);await fs.writeFile(path.join(local.dataDirectory,'collector-config.json.tmp'),JSON.stringify(r.config),{mode:0o600});
        await fs.rename(path.join(local.dataDirectory,'collector-config.json.tmp'),path.join(local.dataDirectory,'collector-config.json'));failures=0;
        if(local.installMode==='user') await fs.writeFile(path.join(local.dataDirectory,'heartbeat-status.json'),JSON.stringify({deviceId:secrets.deviceId,identity:secrets.mappedIdentity,acknowledgedAt:new Date().toISOString()}),{mode:0o600});
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
    if(!config.paused && !uploader.revoked) for(const state of helperStates.values()) {
      if(state.duration>0 && state.name) await queue.append(normalize(secrets.deviceId,'APPLICATION_USAGE',{
        identity:secrets.mappedIdentity,sessionId:state.sessionId,pid:state.pid,name:state.name,
        durationSeconds:Math.min(120,Math.round(state.duration*100)/100),...desktopAppMetadata(state),
        ...(config.browserTitles && state.browserTitle?{browserTitle:state.browserTitle}:{})}));
    }
    await queue.serial;process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
}
