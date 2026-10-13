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

test('risk analysis calculates real risk, updates live, isolates employees and retains analysis during outages', { timeout: 180000 }, async () => {
  const f = await deviceFixture();
  let server, b, sse, profile, failEndpoints = false, delayEmployee = false;
  const exceptions = [], responses = [];
  const previousTimezone = process.env.SECURITY_TIMEZONE;
  process.env.SECURITY_TIMEZONE = 'UTC';
  try {
    const service = new EndpointService(f.prisma);
    const assigned = await service.assign(f.admin, { userId: f.employee.id, name: 'Risk telemetry laptop', platform: 'win32', mappedIdentity: 'S-1-5-21-123' });
    const enrolled = await service.enroll({ token: assigned.enrollmentToken, platform: 'win32', agentVersion: '1.1.0' });
    const offHours = new Date(); offHours.setUTCHours(23, 0, 0, 0);
    if (offHours > Date.now()) offHours.setUTCDate(offHours.getUTCDate() - 1);
    const usage = { version: 1, eventId: randomUUID(), deviceId: assigned.deviceId, type: 'APPLICATION_USAGE', occurredAt: offHours.toISOString(), metadata: { pid: 42, name: 'notepad', durationSeconds: 10, sessionId: '1', identity: 'S-1-5-21-123' } };
    const usb = { version: 1, eventId: randomUUID(), deviceId: assigned.deviceId, type: 'USB_CONNECTED', occurredAt: new Date().toISOString(), metadata: { hardwareId: 'test-usb', name: 'Regression USB' } };
    await service.ingest(enrolled.credential, { events: [usage, usb] });
    // Newer background churn must not hide the older interactive evidence.
    const processes = Array.from({ length: 180 }, (_, index) => ({ version: 1, eventId: randomUUID(), deviceId: assigned.deviceId, type: 'PROCESS_RUNNING', occurredAt: new Date(Date.now() - index * 100).toISOString(), metadata: { pid: index + 1, name: 'powershell' } }));
    await service.ingest(enrolled.credential, { events: processes.slice(0, 100) });
    await service.ingest(enrolled.credential, { events: processes.slice(100) });
    const { default: routes } = await import('../routes/index.js');
    const { generateJwtToken } = await import('../middleware/auth.js');
    const { securityService } = await import('../services/security-service.js');
    sse = (await import('../services/sse.js')).sseManager;
    const app = express();
    app.use(express.json());
    app.use('/api/risk/analysis/:id', async (req, res, next) => {
      if (failEndpoints) return res.status(503).json({ success: false, error: 'Endpoint outage regression fixture' });
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
    const settled = 'document.querySelector(\'[aria-label="Risk analysis summary"]\')?.getAttribute("aria-busy")==="false"';
    const refresh = () => b.evaluate('document.querySelector(\'[aria-label="Refresh risk analysis"]\').click()');
    await waitUntil(b, `${has('NO EMPLOYEE SELECTED')} && document.querySelector('[aria-label="Risk analysis employee"]').options.length>2`, 'manual employee selection');
    await select(f.employee.id);
    await waitUntil(b, `${settled} && ${has('Off-hours interactive activity')} && ${has('OBSERVED RISK SCORE')}`, 'calculated contextual risk');
    assert.equal(await b.evaluate(has('NO TELEMETRY AVAILABLE')), false);
    assert.equal(await b.evaluate(has('Risk assessment pending')), false);
    assert.equal(await b.evaluate(has('Risk telemetry laptop')), false, 'Risk page must not reproduce device cards');
    assert.equal(await b.evaluate(has('APPLICATION USAGE')), false, 'Risk page must not reproduce raw activity lists');
    assert.equal(await b.evaluate(has('What this assessment covers')), true);
    assert.equal(await b.evaluate(has('182 recorded observations reviewed')), true);
    assert.equal(await b.evaluate(has('1 attributed to the employee and 0 device-wide')), true);
    assert.equal(await f.prisma.riskScore.count(), 0, 'Reading analysis must not change authorization scores');
    assert.equal(await f.prisma.mlPrediction.count(), 0);
    const initialAnalysis = await fetch(`${origin}/api/risk/analysis/${f.employee.id}`, { headers: { Authorization: `Bearer ${generateJwtToken(f.admin, true)}` } }).then(response => response.json());
    assert.equal(initialAnalysis.analysis.riskScore, 20);
    assert.equal(initialAnalysis.analysis.coverage.interactiveEvents, 1);
    assert.equal(initialAnalysis.analysis.coverage.endpointEvents, 182);
    const newUsage = { ...usage, eventId: randomUUID(), occurredAt: new Date().toISOString(), metadata: { ...usage.metadata, name: 'brave', durationSeconds: 12 } };
    const accepted = await fetch(`${origin}/api/endpoint/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${enrolled.credential}` }, body: JSON.stringify({ events: [newUsage] }) });
    assert.equal(accepted.status, 200);
    await waitUntil(b, has('2 interactive observations analysed'), 'SSE endpoint risk recalculation');
    // An analysis outage keeps the previous result and marks it potentially stale.
    failEndpoints = true; await refresh();
    await waitUntil(b, `${settled} && ${has('HTTP 503')}`, 'analysis service outage');
    assert.equal(await b.evaluate(has('2 interactive observations analysed')), true);
    failEndpoints = false; await refresh();
    await waitUntil(b, `${settled} && !${has('HTTP 503')}`, 'analysis recovery');
    await select(f.employee2.id);
    await waitUntil(b, `${settled} && ${has('NO TELEMETRY AVAILABLE')}`, 'employee with no events');
    assert.equal(await b.evaluate(has('Risk telemetry laptop')), false);
    assert.equal(await b.evaluate(has('2 interactive observations analysed')), false);
    // A late response for a previous selection must not replace the active employee.
    await select(f.employee.id);
    await waitUntil(b, `${settled} && ${has('2 interactive observations analysed')}`, 'employee restored');
    delayEmployee = true; await select(f.employee2.id);
    await new Promise(resolve => setTimeout(resolve, 100));
    await select(f.employee.id);
    await new Promise(resolve => setTimeout(resolve, 750));
    await waitUntil(b, `${settled} && ${has('2 interactive observations analysed')}`, 'employee selection race');
    const assessment = await securityService.evaluate(f.admin, { userId: f.employee.id, eventType: 'FILE_DOWNLOAD', downloadVolumeMB: 600 });
    // Security-service SSE events update the combined observed risk and recorded trust.
    await waitUntil(b, `${has('Recorded security assessment')} && ${has('Latest recorded trust')}`, 'recorded security assessment');
    const card = label => `Array.from(${main}.querySelectorAll('span')).find(e=>e.textContent.trim()===${JSON.stringify(label)}).parentElement.parentElement.textContent`;
    assert.ok((await b.evaluate(card('OBSERVED RISK SCORE'))).includes(String(assessment.decision.evaluation.riskScore)));
    assert.ok((await b.evaluate(card('TRUST SCORE'))).includes(String(assessment.decision.evaluation.trustScore)));
    assert.equal(await b.evaluate(has('2 interactive observations analysed')), true);
    assert.deepEqual(exceptions, []);
    assert.ok(responses.some(r => r.url.includes(`/api/risk/analysis/${f.employee.id}`) && r.status === 200));
    const denied = await fetch(`${origin}/api/risk/analysis/${f.foreign.id}`, { headers: { Authorization: `Bearer ${generateJwtToken(f.admin, true)}` } });
    assert.equal(denied.status, 404, 'Another company cannot leak through analysis aggregates');
    assert.equal(await f.prisma.mlPrediction.count(), 0);
    assert.ok(!responses.some(r => r.status === 404));
  } finally {
    if (previousTimezone === undefined) delete process.env.SECURITY_TIMEZONE; else process.env.SECURITY_TIMEZONE = previousTimezone;
    if (b) await b.close();
    if (sse) { for (const client of sse.clients) client.end(); clearInterval(sse.heartbeatInterval); }
    if (server) await new Promise(resolve => server.close(resolve));
    await f.close();
    if (profile && path.dirname(profile) === os.tmpdir()) await fs.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});
