import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { deviceFixture, projectRoot } from './device-fixture.js';
import { EndpointService } from '../services/endpoint-service.js';
import { browser, waitUntil } from './browser-tools.js';

test('risk analysis reads actual endpoint APIs, updates live, isolates employees and retains data during outages', { timeout: 180000 }, async () => {
  const f = await deviceFixture();
  let server, b, sse, profile, failEndpoints = false, delayEmployee = false;
  const exceptions = [], responses = [];
  try {
    const service = new EndpointService(f.prisma);
    const assigned = await service.assign(f.admin, { userId: f.employee.id, name: 'Risk telemetry laptop', platform: 'win32', mappedIdentity: 'S-1-5-21-123' });
    const enrolled = await service.enroll({ token: assigned.enrollmentToken, platform: 'win32', agentVersion: '1.1.0' });
    const usage = { version: 1, eventId: randomUUID(), deviceId: assigned.deviceId, type: 'APPLICATION_USAGE', occurredAt: new Date().toISOString(), metadata: { pid: 42, name: 'notepad', durationSeconds: 10, sessionId: '1', identity: 'S-1-5-21-123' } };
    const usb = { version: 1, eventId: randomUUID(), deviceId: assigned.deviceId, type: 'USB_CONNECTED', occurredAt: new Date().toISOString(), metadata: { hardwareId: 'test-usb', name: 'Regression USB' } };
    await service.ingest(enrolled.credential, { events: [usage, usb] });
    const { default: routes } = await import('../routes/index.js');
    const { generateJwtToken } = await import('../middleware/auth.js');
    const { securityService } = await import('../services/security-service.js');
    sse = (await import('../services/sse.js')).sseManager;
    const app = express();
    app.use(express.json());
    app.use('/api/endpoint/dashboard', (req, res, next) => {
      if (failEndpoints) return res.status(503).json({ success: false, error: 'Endpoint outage regression fixture' });
      next();
    });
    app.use('/api/users/:id', async (req, res, next) => {
      if (delayEmployee && req.params.id === f.employee2.id) await new Promise(resolve => setTimeout(resolve, 600));
      next();
    });
    app.use('/api', routes);
    app.use(express.static(path.join(projectRoot, 'client/dist')));
    app.get('*', (req, res) => res.sendFile(path.join(projectRoot, 'client/dist/index.html')));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-risk-browser-'));
    b = await browser(profile);
    b.listeners.push(m => {
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);
      if (m.method === 'Network.responseReceived' && m.params.response.url.startsWith(`${origin}/api/`)) responses.push({ url: m.params.response.url, status: m.params.response.status });
    });
    await b.command('Runtime.enable'); await b.command('Network.enable'); await b.command('Page.enable');
    await b.command('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    await b.command('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('zero_trust_token',${JSON.stringify(generateJwtToken(f.admin, true))});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify({ ...f.admin, passwordHash: undefined }))});` });
    await b.command('Page.navigate', { url: `${origin}/risk-analysis` });
    const main = 'document.querySelector("main")';
    const has = text => `${main}?.textContent.includes(${JSON.stringify(text)})`;
    const select = id => b.evaluate(`(()=>{const e=document.querySelector('[aria-label="Risk analysis employee"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(id)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const settled = 'document.querySelector(\'[aria-label="Recorded endpoint telemetry"]\')?.getAttribute("aria-busy")==="false"';
    const refresh = () => b.evaluate('document.querySelector(\'[aria-label="Refresh risk telemetry"]\').click()');
    await waitUntil(b, `${has('NO EMPLOYEE SELECTED')} && document.querySelector('[aria-label="Risk analysis employee"]').options.length>2`, 'manual employee selection');
    await select(f.employee.id);
    await waitUntil(b, `${settled} && ${has('Risk telemetry laptop')} && ${has('10 seconds foreground usage')}`, 'real recorded endpoint activity');
    assert.equal(await b.evaluate(has('NO TELEMETRY AVAILABLE')), false);
    assert.equal(await b.evaluate(has('Risk assessment pending')), true);
    assert.equal(await b.evaluate(has('Verified employee activity')), true);
    assert.equal(await b.evaluate(has('Device-wide observation')), true);
    assert.equal(await f.prisma.riskScore.count(), 0, 'Displaying observations must not invent an assessment');
    assert.equal(await f.prisma.mlPrediction.count(), 0);
    const newUsage = { ...usage, eventId: randomUUID(), occurredAt: new Date().toISOString(), metadata: { ...usage.metadata, name: 'brave', durationSeconds: 12 } };
    const accepted = await fetch(`${origin}/api/endpoint/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${enrolled.credential}` }, body: JSON.stringify({ events: [newUsage] }) });
    assert.equal(accepted.status, 200);
    await waitUntil(b, has('12 seconds foreground usage'), 'SSE endpoint event refresh');
    // A failed endpoint fetch keeps loaded activity and identifies the failed source.
    failEndpoints = true; await refresh();
    await waitUntil(b, `${settled} && ${has('Endpoint telemetry: HTTP 503')}`, 'partial source outage');
    assert.equal(await b.evaluate(has('12 seconds foreground usage')), true);
    failEndpoints = false; await refresh();
    await waitUntil(b, `${settled} && !${has('Endpoint telemetry: HTTP 503')}`, 'source recovery');
    await select(f.employee2.id);
    await waitUntil(b, `${settled} && ${has('NO TELEMETRY AVAILABLE')}`, 'employee with no events');
    assert.equal(await b.evaluate(has('Risk telemetry laptop')), false);
    assert.equal(await b.evaluate(has('12 seconds foreground usage')), false);
    // A late response for a previous selection must not replace the active employee.
    await select(f.employee.id);
    await waitUntil(b, `${settled} && ${has('12 seconds foreground usage')}`, 'employee restored');
    delayEmployee = true; await select(f.employee2.id);
    await new Promise(resolve => setTimeout(resolve, 100));
    await select(f.employee.id);
    await new Promise(resolve => setTimeout(resolve, 750));
    await waitUntil(b, `${settled} && ${has('12 seconds foreground usage')}`, 'employee selection race');
    const assessment = await securityService.evaluate(f.admin, { userId: f.employee.id, eventType: 'FILE_DOWNLOAD', downloadVolumeMB: 600 });
    // Security-service SSE events update metrics without replacing endpoint records.
    await waitUntil(b, `${has('RISK SCORE')} && ${has('Recorded adaptive trust')}`, 'recorded security assessment');
    const card = label => `Array.from(${main}.querySelectorAll('span')).find(e=>e.textContent.trim()===${JSON.stringify(label)}).parentElement.parentElement.textContent`;
    assert.ok((await b.evaluate(card('RISK SCORE'))).includes(String(assessment.decision.evaluation.riskScore)));
    assert.ok((await b.evaluate(card('TRUST SCORE'))).includes(String(assessment.decision.evaluation.trustScore)));
    assert.equal(await b.evaluate(has('12 seconds foreground usage')), true);
    assert.deepEqual(exceptions, []);
    assert.ok(responses.some(r => r.url.includes(`/api/endpoint/dashboard?userId=${f.employee.id}`) && r.status === 200));
    assert.ok(!responses.some(r => r.status === 404));
  } finally {
    if (b) await b.close();
    if (sse) { for (const client of sse.clients) client.end(); clearInterval(sse.heartbeatInterval); }
    if (server) await new Promise(resolve => server.close(resolve));
    await f.close();
    if (profile && path.dirname(profile) === os.tmpdir()) await fs.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});
