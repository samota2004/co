import os from 'node:os';
import {knownLock,usageEligible} from './desktop-usage.js';
import {exec} from './native.js';
export function heartbeatMetadata() { return {uptimeSeconds:Math.floor(os.uptime()),freeMemoryBytes:os.freemem()}; }
export function monitoringLifecycleState({adminStopped=false,configPaused=false,revoked=false,resuming=false,collectionReady=false}={}) {
  if(adminStopped)return {monitoringState:'PAUSED_BY_ADMIN',pauseReason:'ADMIN_STOP_COMMAND'};
  if(configPaused)return {monitoringState:'PAUSED_BY_ADMIN',pauseReason:'ADMIN_CONFIGURATION'};
  if(revoked)return {monitoringState:'UNKNOWN',pauseReason:'CREDENTIAL_REVOKED'};
  if(resuming||!collectionReady)return {monitoringState:'RESUMING',pauseReason:'COLLECTOR_STARTING'};
  return {monitoringState:'ACTIVE',pauseReason:'NONE'};
}
export function desktopSampleStatus(sample) {
  if (knownLock(sample)===true) return 'healthy: helper connected; session locked, usage excluded';
  if(sample.consoleActive===false)return 'unavailable: employee console inactive; usage excluded';
  if(sample.controlActiveApplication===false)return 'disabled: helper received activeApplication=false';
  if(sample.controlFresh===false)return 'unavailable: native controls missing or stale; usage excluded';
  if(sample.idleStateAvailable===false)return 'unavailable: OS idle state unavailable; usage excluded';
  const unknown=sample.sessionState==='unknown' || sample.sessionStatus==='lock-state-unavailable';
  const prefix=unknown?'degraded: lock unknown; no lock/unlock inference; ':'healthy: helper connected; ';
  if (sample.idleMilliseconds >= 60000) return 'healthy: helper connected; user idle, usage excluded';
  const reasons={'frontmost-unavailable':'AppKit returned no active foreground application','owner-query-failed':'foreground UID query failed','other-user':'foreground belongs to another UID',
    'not-active':'foreground app not active','console-inactive':'employee console inactive','controls-disabled':'application controls disabled','controls-stale':'application controls stale','session-locked':'session locked','available':'foreground verified'};
  if (!sample.name || sample.activityEligible===false)return (prefix+'foreground process unavailable: '+(reasons[sample.foregroundStatus] || 'OS identity missing')+'; usage excluded').slice(0,240);
  if(unknown)return prefix+(usageEligible(sample)?'own foreground verified; usage eligible':'foreground unverified; usage excluded');
  return 'healthy: helper connected; foreground sample active';
}
export function desktopDiagnosticStatus(status) {
  const statuses={'unsupported-compositor':'unavailable: unsupported Wayland compositor',
    'idle-state-unavailable':'unavailable: awaiting compositor idle/resume signal',
    'session-state-unavailable':'unavailable: desktop session state not accessible',
    'desktop-query-failed':'unavailable: check desktop permissions and GNOME/KDE integration'};
  return typeof status==='string' && Object.hasOwn(statuses,status)?statuses[status]:null;
}
export function healthReport(queue, collectors, config, helperLastSeen, administrativeState, serviceControlState, lifecycle) {
  return {...queue.health(),collectors:{...collectors},paused:config.paused,helperLastSeen,
    ...(administrativeState?{administrativeState}:{}),...(lifecycle||{}),...(serviceControlState?{serviceControlState}:{})};
}
export async function windowsServiceControlState(platform=process.platform,run=exec) {
  if(platform!=='win32')return 'UNVERIFIED';
  try {
    const {stdout}=await run('sc.exe',['query','CyberOrbitAgent'],{timeout:3000,windowsHide:true,maxBuffer:16384});
    const match=/\bSTATE\s*:\s*(\d+)/i.exec(stdout||'');
    return ({1:'STOPPED',2:'START_PENDING',3:'STOP_PENDING',4:'RUNNING'})[Number(match?.[1])]||'UNKNOWN';
  }catch{return 'UNKNOWN';}
}
