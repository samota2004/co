// The only wire contract used by both agent and API. No user/company identity on the wire.
export const VERSION = 1;
export const AGENT_VERSION = '1.0.8';
export class EnrollmentValidationError extends Error {
  constructor(code, field, reason, message) {
    super(message); this.name = 'EnrollmentValidationError';
    this.code = code; this.field = field; this.reason = reason;
  }
}
export function validateEnrollment(body) {
  const fail = (code, field, reason, message) => { throw new EnrollmentValidationError(code, field, reason, message); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('ENROLLMENT_SCHEMA_INVALID', 'payload', 'object_required', 'Enrollment requires a JSON object with token, platform and agentVersion.');
  if (Object.keys(body).some(k => !['token','platform','agentVersion'].includes(k))) fail('ENROLLMENT_SCHEMA_INVALID', 'payload', 'unexpected_fields', 'Enrollment accepts only token, platform and agentVersion. Update the agent package.');
  if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) fail('ENROLLMENT_TOKEN_FORMAT', 'token', 'invalid_format', 'Enrollment token must be exactly 43 letters, digits, hyphens or underscores. Copy only the token from Issue Enrollment Token, without quotes, labels or JSON.');
  if (!['win32','linux','darwin'].includes(body.platform)) fail('ENROLLMENT_PLATFORM_INVALID', 'platform', 'unsupported_platform', 'Enrollment platform must be win32, linux or darwin. Update the agent package.');
  if (typeof body.agentVersion !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,39}$/.test(body.agentVersion)) fail('ENROLLMENT_VERSION_INVALID', 'agentVersion', 'invalid_version', 'Enrollment agentVersion must be a nonempty version string of at most 40 letters, digits, dots, plus signs, hyphens or underscores.');
  return body;
}
export const DEFAULT_CONFIG = Object.freeze({ paused: false, pollSeconds: 15,
  processes: true, sessions: true, usb: true, activeApplication: true,
  network: false, browserTitles: false, approvedDirectories: [] });
const shapes = {
  HEARTBEAT: { uptimeSeconds: 'number', freeMemoryBytes: 'number' },
  PROCESS_RUNNING: { pid: 'number', name: 'string', startedAt: 'string', sessionId: 'string', appId:'string' },
  PROCESS_START: { pid: 'number', name: 'string', startedAt: 'string', sessionId: 'string', appId:'string' },
  PROCESS_STOP: { pid: 'number', name: 'string', startedAt: 'string', sessionId: 'string', appId:'string' },
  APPLICATION_USAGE: { pid: 'number', name: 'string', durationSeconds: 'number', sessionId: 'string', browserTitle: 'string', appId:'string', appName:'string', hostName:'string', identitySource:'string' },
  APPLICATION_FOREGROUND: { pid:'number', name:'string', sessionId:'string', appId:'string', appName:'string', hostName:'string', identitySource:'string' },
  SESSION_LOGIN: { sessionId: 'string', state: 'string' },
  SESSION_LOGOUT: { sessionId: 'string', state: 'string' },
  SESSION_LOCK: { sessionId: 'string', state: 'string' },
  SESSION_UNLOCK: { sessionId: 'string', state: 'string' },
  SESSION_STATE: { sessionId: 'string', state: 'string' },
  USB_CONNECTED: { hardwareId: 'string', name: 'string' },
  USB_REMOVED: { hardwareId: 'string', name: 'string' },
  FILE_CHANGE: { directory: 'string', relativePath: 'string', change: 'string' },
  NETWORK_CONNECTION: { pid: 'number', protocol: 'string', localAddress: 'string', localPort: 'number', remoteAddress: 'string', remotePort: 'number', state: 'string' }
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateEvent(e, now = Date.now()) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) throw new Error('Invalid event');
  if (Object.keys(e).some(k => !['version', 'eventId', 'deviceId', 'occurredAt', 'type', 'metadata'].includes(k))) throw new Error('Unknown event field');
  if (e.version !== VERSION || !uuid.test(e.eventId) || !uuid.test(e.deviceId) || !shapes[e.type]) throw new Error('Invalid event identity/type/version');
  const t = Date.parse(e.occurredAt);
  if (typeof e.occurredAt !== 'string' || !e.occurredAt.endsWith('Z') || !Number.isFinite(t) || t > now + 300000 || t < now - 8 * 86400000) throw new Error('Event timestamp outside retention window');
  if (!e.metadata || Array.isArray(e.metadata) || typeof e.metadata !== 'object' || Buffer.byteLength(JSON.stringify(e.metadata)) > 4096) throw new Error('Invalid metadata');
  const required = e.type.startsWith('PROCESS_') ? ['pid','name'] : e.type.startsWith('SESSION_') ? ['sessionId','state'] : e.type.startsWith('USB_') ? ['hardwareId','name'] : e.type==='APPLICATION_USAGE' ? ['pid','name','durationSeconds','sessionId'] : e.type==='APPLICATION_FOREGROUND' ? ['pid','name','sessionId'] : Object.keys(shapes[e.type]);
  if (required.some(k=>!(k in e.metadata))) throw new Error('Missing event metadata');
  for (const [k, v] of Object.entries(e.metadata)) {
    const type = k === 'identity' ? 'string' : shapes[e.type][k];
    if (!type || typeof v !== type || (type === 'string' && v.length > 1024) || (type === 'number' && (!Number.isFinite(v) || v < 0))) throw new Error(`Invalid metadata field: ${k}`);
  }
  if (e.type === 'APPLICATION_USAGE' && (!Number.isFinite(e.metadata.durationSeconds) || e.metadata.durationSeconds > 120)) throw new Error('Invalid usage duration');
  if (e.metadata.identitySource!==undefined && !['process','hosted-process','windows-app-id','unresolved-host'].includes(e.metadata.identitySource)) throw new Error('Invalid application identity source');
  if ('browserTitle' in e.metadata && (!/^(chrome|brave|msedge|firefox)(\.exe)?$/i.test(e.metadata.name) || !e.metadata.browserTitle.trim() || e.metadata.browserTitle.length>256 || /[\x00-\x1f\x7f]/.test(e.metadata.browserTitle))) throw new Error('Invalid browser title');
  return e;
}
export function validateConfig(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !(k in DEFAULT_CONFIG))) throw new Error('Invalid collector configuration');
  const out = { ...DEFAULT_CONFIG, ...c };
  for (const k of ['paused', 'processes', 'sessions', 'usb', 'activeApplication', 'network', 'browserTitles']) if (typeof out[k] !== 'boolean') throw new Error(`Invalid ${k}`);
  if (!Number.isInteger(out.pollSeconds) || out.pollSeconds < 5 || out.pollSeconds > 300) throw new Error('pollSeconds must be 5..300');
  if (!Array.isArray(out.approvedDirectories) || out.approvedDirectories.length > 20 || out.approvedDirectories.some(p => typeof p !== 'string' || !p || p.length > 1024)) throw new Error('Invalid approved directories');
  return out;
}
export function validateHealth(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h) || Buffer.byteLength(JSON.stringify(h)) > 8192) throw new Error('Invalid health');
  const allowed = ['queueEvents', 'queueBytes', 'droppedEvents', 'collectors', 'helperLastSeen', 'paused'];
  if (Object.keys(h).some(k => !allowed.includes(k))) throw new Error('Unknown health field');
  for (const k of ['queueEvents', 'queueBytes', 'droppedEvents']) if (!Number.isSafeInteger(h[k]) || h[k] < 0) throw new Error(`Invalid ${k}`);
  if (typeof h.paused !== 'boolean') throw new Error('Invalid paused');
  if (h.helperLastSeen !== null && !Number.isFinite(Date.parse(h.helperLastSeen))) throw new Error('Invalid helper last seen');
  if (!h.collectors || typeof h.collectors !== 'object' || Array.isArray(h.collectors) || Object.keys(h.collectors).length > 12 || Object.entries(h.collectors).some(([k,v]) => k.length > 40 || typeof v !== 'string' || v.length > 240)) throw new Error('Invalid collectors');
  return h;
}
