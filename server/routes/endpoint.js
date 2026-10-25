import express from 'express';
import { prisma, isValidPostgresUrl } from '../models/prisma.js';
import { requireAuth, requireSecurityAdmin } from '../middleware/auth.js';
import { EndpointService, EndpointError } from '../services/endpoint-service.js';
import { endpointRequestContext, endpointFailure } from '../middleware/endpoint-errors.js';
import { sseManager } from '../services/sse.js';
import {cityAddressDiagnostics,cityRequestAddress} from '../services/proxy-policy.js';
import {refreshDailyRiskSnapshot} from '../services/daily-risk-snapshot-service.js';
const router = express.Router();
const service = new EndpointService(prisma);
const attempts = new Map();
router.use(endpointRequestContext);
router.use((req, res, next) => {
  // Fail closed rather than acknowledge Prisma's existing memory-mode proxy.
  if (!isValidPostgresUrl(process.env.DATABASE_URL)) return res.status(503).json({ error: 'Durable PostgreSQL required' });
  const loopback = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (process.env.NODE_ENV === 'production' && !req.secure) {
  console.warn('[endpoint-https-check]', JSON.stringify({
    secure: req.secure,
    encrypted: Boolean(req.socket.encrypted),
    ...cityAddressDiagnostics(req)
  }));
}
  if (!req.secure && !(process.env.NODE_ENV !== 'production' && process.env.ENDPOINT_ALLOW_LOOPBACK_HTTP === 'true' && loopback)) return res.status(426).json({ error: 'HTTPS required. Local development on loopback requires ENDPOINT_ALLOW_LOOPBACK_HTTP=true and a backend restart.' });
  if (['POST','PUT'].includes(req.method) && (!req.is('application/json') || !req.body || Array.isArray(req.body) || typeof req.body !== 'object')) return endpointFailure(req, res, 400, 'JSON object required with Content-Type: application/json.', 'ENDPOINT_JSON_OBJECT_REQUIRED');
  next();
});
const handle = fn => async (req, res) => {
  try { res.json({ success: true, ...await fn(req) }); }
  catch (e) {
    let status = e instanceof EndpointError ? e.status : 503, message = e instanceof EndpointError ? e.message : 'Endpoint database operation unavailable. Check the backend database connection.';
    if (['P2021','P2022'].includes(e.code)) message = 'Endpoint database migrations are missing. Run prisma migrate deploy and prisma generate, then restart the backend.';
    if (['P2002','P2003'].includes(e.code)) { status = 409; message = 'Employee or device assignment conflicts with the database. Refresh and try again.'; }
    const code = e instanceof EndpointError ? e.code : /^P\d{4}$/.test(e.code || '') ? e.code : 'ENDPOINT_DATABASE_UNAVAILABLE';
    endpointFailure(req, res, status, message, code, e instanceof EndpointError ? { field: e.field, reason: e.reason } : {});
  }
};
const credential = req => req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
router.post('/assign', requireSecurityAdmin, (req,res,next) => { res.set('Cache-Control','no-store'); next(); }, handle(req => service.assign(req.user, req.body)));
router.post('/:id/enrollment-token', requireSecurityAdmin, (req,res,next) => { res.set('Cache-Control','no-store'); next(); }, handle(req => service.issueEnrollmentToken(req.user, req.params.id)));
router.post('/enroll', (req, res, next) => {
  const now = Date.now();
  for (const [k,v] of attempts) if (v.until < now) attempts.delete(k);
  const k = req.socket.remoteAddress;
  const a = attempts.get(k) || { count: 0, until: now + 60000 }; a.count++; attempts.set(k,a);
  if (a.count > 10 || attempts.size > 10000) return res.status(429).json({ error: 'Enrollment rate limited' });
  next();
}, handle(req => service.enroll(req.body)));
router.post('/ingest', handle(async req => {
  const result = await service.ingest(credential(req), req.body);
  if (result.acceptedEventIds?.length) {
    const accepted = await prisma.endpointEvent.findMany({ where: { deviceId: result.deviceId, eventId: { in: result.acceptedEventIds }, userId: { not: null } }, select: { userId: true, occurredAt: true } });
    const days = new Map(accepted.map(event => [`${event.userId}:${event.occurredAt.toISOString().slice(0,10)}`, event]));
    for (const event of days.values()) try { await refreshDailyRiskSnapshot(prisma, { userId: event.userId, day: event.occurredAt }); } catch (error) { console.warn('Endpoint daily snapshot refresh deferred:', error?.code || error?.name || 'unavailable'); }
  }
  sseManager.broadcast('ENDPOINT_UPDATED', { companyId: result.companyId, userId: result.userId });
  return { acceptedEventIds: result.acceptedEventIds };
}));
router.post('/heartbeat', handle(async req => {
  const result = await service.heartbeat(credential(req), req.body,cityRequestAddress(req),cityAddressDiagnostics(req));
  sseManager.broadcast('ENDPOINT_UPDATED', { companyId: result.companyId, userId: result.userId });
  return { config: result.config, accountControl: result.accountControl };
}));
router.get('/dashboard', requireAuth, handle(req => service.dashboard(req.user, req.query.userId, req.query.eventType, req.query.deviceId, req.query.readinessDate)));
router.put('/:id/config', requireSecurityAdmin, handle(req => service.change(req.user, req.params.id, req.body)));
router.post('/:id/city-estimate', requireSecurityAdmin, handle(req => service.changeCity(req.user, req.params.id, req.body)));
router.post('/:id/revoke', requireSecurityAdmin, handle(req => service.change(req.user, req.params.id, {}, true)));
export default router;
