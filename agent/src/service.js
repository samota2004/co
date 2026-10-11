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
import { desktopSampleStatus, heartbeatMetadata, healthReport } from './health.js';
import { AGENT_VERSION, DEFAULT_CONFIG } from '../shared/contract.js';
import { reconcileAccountControl } from './account-control.js';
export async function runService(local) {
  // Exclusive creation prevents simultaneous services from corrupting queue state.
  const lockPath=path.join(local.dataDirectory,'service.lock');
  try {const pid=Number(await fs.readFile(lockPath,'utf8'));try{process.kill(pid,0);throw new Error('Service already running');}catch(e){if(e.code!=='ESRCH') throw e;} await fs.unlink(lockPath);} catch(e) {if(e.code!=='ENOENT') throw e;}
  const lock=await fs.open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));await lock.close();
  // Credential/helper startup errors must release our lock too.
  try { await runEnrolledService(local); }
  finally { await fs.unlink(lockPath); }
}
async function runEnrolledService(local) {
  const secrets=await new CredentialStore(local.dataDirectory).load();
  const queue=await new EncryptedQueue(path.join(local.dataDirectory,'queue'),secrets.queueKey).init();
  const transport=new Transport(local,secrets.credential), uploader=new Uploader(queue,transport);
  let remote=DEFAULT_CONFIG;
  try {remote=JSON.parse(await fs.readFile(path.join(local.dataDirectory,'collector-config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  let config=effectiveConfig(remote,local), stopping=false, helperLastSeen=null, health={}, helperStates=new Map();
  const emit=async(type,metadata)=> {if(!stopping && !config.paused && !uploader.revoked) await queue.append(normalize(secrets.deviceId,type,metadata));};
  const collectors=new SystemCollectors(emit,health), files=new FileCollector(emit,health);
  const flush=async state => {
    if(state.duration>0 && state.name) await emit('APPLICATION_USAGE',{identity:secrets.mappedIdentity,sessionId:state.sessionId,pid:state.pid,name:state.name,durationSeconds:Math.round(state.duration*100)/100,...desktopAppMetadata(state),...(config.browserTitles && state.browserTitle?{browserTitle:state.browserTitle}:{})});
    state.duration=0;
  };
  const ipc=await startIpc(secrets,async s=> {
    if(config.paused || !config.activeApplication || uploader.revoked) return;
    if(typeof s.sessionId!=='string' || s.sessionId.length>30 || typeof s.name!=='string' || s.name.length>256 || !Number.isSafeInteger(s.pid) || s.pid<0 || !Number.isFinite(s.idleMilliseconds) || s.idleMilliseconds<0) throw new Error('Invalid desktop sample');
    s.browserTitle=config.browserTitles && /^(chrome|brave|msedge|firefox)(\.exe)?$/i.test(s.name) && typeof s.browserTitle==='string' ? s.browserTitle.replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,256) : '';
    const now=Date.now(), prior=helperStates.get(s.sessionId);
    if(!prior && helperStates.size>100) throw new Error('Session capacity reached');
    helperLastSeen=new Date(now).toISOString();
    health.desktop=desktopSampleStatus(s);
    if(foregroundObserved(prior,s,now)) await emit('APPLICATION_FOREGROUND',{identity:secrets.mappedIdentity,sessionId:s.sessionId,pid:s.pid,name:s.name,...desktopAppMetadata(s)});
    if(prior) {
      // Bound gaps: a crashed/offline helper cannot invent hours of usage.
      if(now-prior.time<=5000 && prior.locked!==true && prior.idleMilliseconds<60000 && s.locked!==true && s.idleMilliseconds<60000) prior.duration+=(now-prior.time)/1000;
      if(desktopAppChanged(prior,s) || s.locked===true || prior.duration>=30) await flush(prior);
      if(typeof s.locked==='boolean' && typeof prior.locked==='boolean' && s.locked!==prior.locked && config.sessions) await emit(s.locked?'SESSION_LOCK':'SESSION_UNLOCK',{identity:secrets.mappedIdentity,sessionId:s.sessionId,state:s.locked?'locked':'unlocked'});
    }
    helperStates.set(s.sessionId,{...s,time:now,duration:prior?.duration || 0});
  });
  const stop=()=>{stopping=true;ipc.close();files.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const collect=async()=> {
    while(!stopping) {
      if(!config.paused && !uploader.revoked) {await collectors.poll(config);await files.configure(config.approvedDirectories);}
      else {files.close();files.signature='';helperStates.clear();health.desktop='disabled: paused or revoked';}
      if(!helperLastSeen || Date.now()-Date.parse(helperLastSeen)>15000) health.desktop=config.activeApplication?'unavailable: desktop helper not connected':'disabled';
      health.browserTitles=config.paused || !config.activeApplication?'disabled: desktop monitoring paused':config.browserTitles?'enabled: requires updated desktop helper; titles only':'disabled: requires local and dashboard approval';
      await new Promise(r=>setTimeout(r,config.pollSeconds*1000));
    }
  };
  const upload=async()=> {while(!stopping){await uploader.tick();await new Promise(r=>setTimeout(r,1000));}};
  const heartbeat=async()=> {
    let failures=0;
    while(!stopping) {
      try {
        if(uploader.revoked) {stop();break;}
        await emit('HEARTBEAT',heartbeatMetadata());
        const r=await transport.post('heartbeat',{agentVersion:AGENT_VERSION,health:healthReport(queue,health,config,helperLastSeen)});
        health.windowsAccount=await reconcileAccountControl(local,secrets,r.accountControl);
        config=effectiveConfig(r.config,local);await fs.writeFile(path.join(local.dataDirectory,'collector-config.json.tmp'),JSON.stringify(r.config),{mode:0o600});
        await fs.rename(path.join(local.dataDirectory,'collector-config.json.tmp'),path.join(local.dataDirectory,'collector-config.json'));failures=0;
      }catch(e){if(e.status===401 || e.status===403){uploader.revoked=true;stop();break;}failures++;}
      await new Promise(r=>setTimeout(r,failures?1000+Math.random()*Math.min(300000,1000*2**Math.min(failures,12)):30000));
    }
  };
  console.log('CYBERORBIT agent running; desktop monitoring requires the visible session helper.');
  try {await Promise.all([collect(),upload(),heartbeat()]);} finally {stop();await queue.serial;}
}
