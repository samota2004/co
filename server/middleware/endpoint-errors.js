import { randomUUID } from 'node:crypto';

export function endpointRequestContext(req, res, next) {
  req.endpointRequestId ||= randomUUID();
  res.set('X-Request-ID', req.endpointRequestId);
  res.set('Cache-Control', 'no-store');
  next();
}
export function endpointFailure(req, res, status, message, code, diagnostics = {}) {
  const requestId = req.endpointRequestId || randomUUID();
  // Only controlled codes/field names/reasons. Never error objects, stacks,
  // request URLs, bodies, headers, token hashes or credential values.
  console.warn('[endpoint]', JSON.stringify({ method: req.method, route: req.route?.path || 'payload', status, code, requestId,
    ...(diagnostics.field ? { field: diagnostics.field } : {}), ...(diagnostics.reason ? { reason: diagnostics.reason } : {}) }));
  res.status(status).json({ success: false, error: message, code, requestId });
}
export function endpointPayloadError(error, req, res, next) {
  if (error.type === 'entity.parse.failed') return endpointFailure(req, res, 400, 'Invalid JSON enrollment/telemetry payload. Update the agent package.', 'ENDPOINT_JSON_INVALID');
  if (error.type === 'entity.too.large') return endpointFailure(req, res, 413, 'Endpoint payload exceeds the 256 KB limit.', 'ENDPOINT_PAYLOAD_TOO_LARGE');
  if (['request.aborted','request.size.invalid','encoding.unsupported','charset.unsupported'].includes(error.type)) return endpointFailure(req, res, 400, 'Endpoint request body or encoding is invalid. Retry using the updated agent.', 'ENDPOINT_BODY_INVALID');
  return endpointFailure(req, res, 503, 'Endpoint request body could not be processed. Retry with the updated agent.', 'ENDPOINT_BODY_UNAVAILABLE');
}
