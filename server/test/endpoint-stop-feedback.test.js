import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stopCommandError, stopCommandStatus, stopCommandSuccess } from '../../client/src/services/endpoint-stop-feedback.js';
import { requestApi } from '../../client/src/services/api.js';

const expiry = new Date(Date.now() + 60_000).toISOString();
const command = status => ({ commandId: 'synthetic-command-id', status, expiresAt: expiry });

test('stop action success feedback distinguishes online, offline, acknowledged, and expired commands', () => {
  assert.match(stopCommandSuccess(command('PENDING')).message, /waiting for the agent heartbeat/i);
  assert.match(stopCommandSuccess(command('PENDING_OFFLINE')).message, /device is offline/i);
  assert.match(stopCommandSuccess(command('ACKNOWLEDGED')).message, /not an independent Windows service status check/i);
  assert.equal(stopCommandSuccess(command('EXPIRED')).kind, 'error');
  assert.match(stopCommandSuccess(command('EXPIRED')).message, /expired/i);
  assert.equal(stopCommandSuccess({ ...command('PENDING_OFFLINE'), expiresAt: new Date(Date.now() - 1).toISOString() }).kind, 'error');
  assert.equal(stopCommandSuccess({ status: 'PENDING' }).kind, 'error', 'missing command identity/expiry is not reported as success');
});

test('stop action exposes specific MFA, authorization, validation, device, expiry, and server failures', () => {
  assert.match(stopCommandError({ status: 403, code: 'FRESH_MFA_REQUIRED' }), /recent administrator MFA/i);
  assert.match(stopCommandError({ status: 403, code: 'FORBIDDEN' }), /active Security Administrator/i);
  assert.match(stopCommandError({ status: 400, code: 'AGENT_ACTION_REASON_REQUIRED' }), /8–500 characters/i);
  assert.match(stopCommandError({ status: 404 }), /company scope/i);
  assert.match(stopCommandError({ status: 409, message: 'Device is not a Windows service agent.' }), /not a Windows service agent/i);
  assert.match(stopCommandError({ status: 503 }), /Prisma migration/i);
  assert.match(stopCommandError({ status: 500 }), /server failed/i);
  assert.match(stopCommandError(new Error('Cannot reach the backend. Check your connection and try again.')), /No stop command was confirmed/i);
});

test('device command history presents current pending, expired, and acknowledged state clearly', () => {
  assert.match(stopCommandStatus({ status: 'PENDING_OFFLINE' }), /device offline/i);
  assert.match(stopCommandStatus({ status: 'PENDING_OFFLINE', expiresAt: new Date(Date.now() - 1).toISOString() }), /^Expired/i);
  assert.match(stopCommandStatus({ status: 'PENDING', expiresAt: new Date(Date.now() - 1).toISOString() }), /^Expired/i);
  assert.match(stopCommandStatus({ status: 'PENDING' }), /authenticated agent heartbeat/i);
  assert.match(stopCommandStatus({ status: 'ACKNOWLEDGED' }), /not independently verified/i);
  assert.match(stopCommandStatus({ status: 'EXPIRED' }), /did not acknowledge/i);
});

test('authenticated API helper preserves stop-route HTTP status and machine error code for UI feedback', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/endpoint/device-id/stop-agent');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-session');
    assert.deepEqual(JSON.parse(options.body), { reason: 'Approved maintenance window' });
    return { ok: false, status: 403, json: async () => ({ success: false, error: { code: 'FRESH_MFA_REQUIRED', message: 'Complete MFA.' } }) };
  };
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === 'zero_trust_token' ? 'test-session' : null };
  try {
    await assert.rejects(
      requestApi('/api/endpoint/device-id/stop-agent', { method: 'POST', body: { reason: 'Approved maintenance window' } }),
      error => error.status === 403 && error.code === 'FRESH_MFA_REQUIRED' && error.message === 'Complete MFA.'
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});
