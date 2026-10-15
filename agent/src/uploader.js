import { validateServerUrl } from './config.js';
function safeMessage(value, secrets) {
  if (typeof value !== 'string') return '';
  for (const secret of secrets) if (typeof secret === 'string' && secret) value = value.split(secret).join('[redacted]');
  return value.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/[A-Za-z0-9_-]{43,}/g, '[redacted]').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 400);
}
async function errorDetails(response) {
  if (!response.headers.get('content-type')?.includes('application/json') || !response.body) return {};
  const reader = response.body.getReader();
  let bytes = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 8192) { await reader.cancel(); return {}; }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch { return {}; }
  finally { reader.releaseLock(); }
}
export class Transport {
  constructor(config, credential, fetcher = fetch) {
    if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0') throw new Error('Disabling TLS verification is prohibited');
    this.url = validateServerUrl(config.serverUrl, config.allowLoopbackHttp); this.credential = credential; this.fetch = fetcher;
  }
  async post(route, body) {
    const r = await this.fetch(`${this.url}/api/endpoint/${route}`, { method:'POST', redirect:'error', signal:AbortSignal.timeout(15000),
      headers:{'Content-Type':'application/json', ...(this.credential ? {Authorization:`Bearer ${this.credential}`} : {})}, body:JSON.stringify(body) });
    if (!r.ok) {
      const data = await errorDetails(r);
      const code = data.code || data.error?.code;
      const requestId = data.requestId;
      const message = safeMessage(typeof data.error === 'string' ? data.error : data.error?.message, [body?.token, this.credential]);
      const e = new Error(`Endpoint HTTP ${r.status}${message ? `: ${message}` : '. Backend returned no usable error details.'}`);
      e.status = r.status;
      if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,39}$/.test(code)) { e.code = code; e.message += ` [${code}]`; }
      if (typeof requestId === 'string' && /^[0-9a-f-]{36}$/i.test(requestId)) { e.requestId = requestId; e.message += ` (request ${requestId})`; }
      throw e;
    }
    const data = await r.json(); if (!data.success) throw new Error('Invalid acceptance response'); return data;
  }
}
export class Uploader {
  constructor(queue, transport) { this.queue = queue; this.transport = transport; this.failures = 0; this.nextAttempt = 0; this.revoked = false; }
  async tick(now = Date.now()) {
    if (this.revoked || now < this.nextAttempt) return;
    const events = await this.queue.batch(); if (!events.length) return;
    try {
      const r = await this.transport.post('ingest',{events});
      if (!Array.isArray(r.acceptedEventIds) || r.acceptedEventIds.some(id=>!events.some(e=>e.eventId===id))) throw new Error('Invalid durable acknowledgment');
      await this.queue.acknowledge(r.acceptedEventIds); this.failures = 0; this.nextAttempt = now + 1000;
      const acceptedUsage=events.filter(e=>e.type==='APPLICATION_USAGE' && r.acceptedEventIds.includes(e.eventId)).at(-1);
      if(acceptedUsage)this.lastAcceptedUsage={eventId:acceptedUsage.eventId,occurredAt:acceptedUsage.occurredAt,acknowledgedAt:new Date().toISOString()};
    } catch(e) {
      if (e.status === 401 || e.status === 403) this.revoked = true;
      this.failures++; this.nextAttempt = now + 1000 + Math.random()*Math.min(300000,1000*2**Math.min(this.failures,12));
    }
  }
}
