import os from 'node:os';
export function heartbeatMetadata() { return {uptimeSeconds:Math.floor(os.uptime()),freeMemoryBytes:os.freemem()}; }
export function desktopSampleStatus(sample) {
  if (sample.locked === true) return 'healthy: helper connected; session locked, usage excluded';
  if (sample.idleMilliseconds >= 60000) return 'healthy: helper connected; user idle, usage excluded';
  if (!sample.name) return 'healthy: helper connected; foreground process unavailable';
  return 'healthy: helper connected; foreground sample active';
}
export function healthReport(queue, collectors, config, helperLastSeen) { return {...queue.health(),collectors:{...collectors},paused:config.paused,helperLastSeen}; }
