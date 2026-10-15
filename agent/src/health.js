import os from 'node:os';
import {knownLock,usageEligible} from './desktop-usage.js';
export function heartbeatMetadata() { return {uptimeSeconds:Math.floor(os.uptime()),freeMemoryBytes:os.freemem()}; }
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
export function healthReport(queue, collectors, config, helperLastSeen) { return {...queue.health(),collectors:{...collectors},paused:config.paused,helperLastSeen}; }
