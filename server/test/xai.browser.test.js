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

test('XAI loads employee risk evidence and archived SHAP, handles live updates, search, failures and employee isolation', { timeout: 180000 }, async () => {
  const f = await deviceFixture();
  let server, b, sse, profile, fail = false, slow = false;
  const previousTimezone = process.env.SECURITY_TIMEZONE;
  process.env.SECURITY_TIMEZONE = 'UTC';
  const exceptions = [];
  try {
    const service = new EndpointService(f.prisma);
    const assignment = await service.assign(f.admin, { userId: f.employee.id, name: 'XAI laptop', platform: 'win32', mappedIdentity: 'S-1-5-21-42' });
    const enrolled = await service.enroll({ token: assignment.enrollmentToken, platform: 'win32', agentVersion: '1.1.0' });
    const time = new Date(); time.setUTCHours(23, 0, 0, 0); if (time > Date.now()) time.setUTCDate(time.getUTCDate() - 1);
    const usage = { version: 1, eventId: randomUUID(), deviceId: assignment.deviceId, type: 'APPLICATION_USAGE', occurredAt: time.toISOString(), metadata: { pid: 42, name: 'notepad', durationSeconds: 10, sessionId: '1', identity: 'S-1-5-21-42' } };
    await service.ingest(enrolled.credential, { events: [usage] });
    const { default: routes } = await import('../routes/index.js');
    const { generateJwtToken } = await import('../middleware/auth.js');
    const { registerModel } = await import('../services/ml-service.js');
    sse = (await import('../services/sse.js')).sseManager;
    const app = express(); app.use(express.json());
    app.use('/api/risk/analysis/:id', async (req, res, next) => {
      if (fail) return res.status(503).json({ success: false, error: 'XAI outage regression fixture' });
      if (slow && req.params.id === f.employee2.id) await new Promise(resolve => setTimeout(resolve, 600));
      next();
    });
    app.use('/api', routes); app.use(express.static(path.join(projectRoot, 'client/dist')));
    app.get('*', (req, res) => res.sendFile(path.join(projectRoot, 'client/dist/index.html')));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'orbit-xai-browser-')); b = await browser(profile);
    b.listeners.push(message => { if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text); });
    await b.command('Runtime.enable'); await b.command('Network.enable'); await b.command('Page.enable');
    await b.command('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'] });
    await b.command('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('zero_trust_token',${JSON.stringify(generateJwtToken(f.admin, true))});localStorage.setItem('zero_trust_user',${JSON.stringify(JSON.stringify({ ...f.admin, passwordHash: undefined }))});` });
    await b.command('Page.navigate', { url: `${origin}/xai` });
    const panel = 'document.querySelector(\'[aria-label="Employee risk explanations"]\')';
    const contextual = 'document.querySelector(\'[aria-label="Contextual risk explanations"]\')';
    const model = 'document.querySelector(\'[aria-label="Model SHAP explanations"]\')';
    const has = (text, root = panel) => `${root}?.textContent.includes(${JSON.stringify(text)})`;
    const settled = `${panel}?.getAttribute('aria-busy')==='false'`;
    const change = (selector, value) => b.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
    const choose = id => change('[aria-label="Explainable AI employee"]', id);
    const refresh = () => b.evaluate('document.querySelector(\'[aria-label="Refresh explanations"]\').click()');
    await waitUntil(b, `${has('Select an employee')} && document.querySelector('[aria-label="Explainable AI employee"]').options.length>2`, 'employee selector');
    await choose(f.employee.id);
    await waitUntil(b, `${settled} && ${has('Off-hours interactive activity', contextual)}`, 'actual contextual explanations');
    assert.equal(await b.evaluate(has('Risk contribution: +20', contextual)), true);
    assert.equal(await b.evaluate(has('SHAP +', contextual)), false, 'Contextual contributions are not SHAP');
    assert.equal(await b.evaluate(has('CERT model assessment awaiting complete inputs', model)), true);
    assert.equal(await f.prisma.mlPrediction.count(), 0, 'Reading XAI must not manufacture model predictions');
    const newUsage = { ...usage, eventId: randomUUID(), metadata: { ...usage.metadata, durationSeconds: 12 } };
    const accepted = await fetch(`${origin}/api/endpoint/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${enrolled.credential}` }, body: JSON.stringify({ events: [newUsage] }) });
    assert.equal(accepted.status, 200);
    await waitUntil(b, has('2 interactive observations', contextual), 'live endpoint explanation refresh');
    const version = await registerModel(f.prisma);
    const timestamp = new Date(Date.now() - 48 * 3600000);
    await f.prisma.mlPrediction.create({ data: { userId: f.employee.id, modelVersionId: version.id, featureVector: {}, anomalyScore: 0, riskScore: 0, isAnomalous: false, timestamp, attributions: [
      { feature: 'email_event_count', value: 0, shap_value: .12 },
      { feature: 'logon_count', value: 3, shap_value: -.08 },
      { feature: 'day_of_week', value: 0, shap_value: 0 },
      { feature: 'malformed', shap_value: null },
      '<img src=x onerror="window.xaiInjected=true">',
    ] } });
    await refresh();
    await waitUntil(b, `${settled} && ${has('SHAP +0.1200', model)} && ${has('SHAP -0.0800', model)}`, 'saved archived SHAP independent of recent activity');
    assert.equal(await b.evaluate(has('SHAP +0.0000', model)), true);
    assert.equal(await b.evaluate(has('no directional change', model)), true);
    assert.equal(await b.evaluate(has('Model feature value: 0', model)), true);
    assert.equal(await b.evaluate(has('0.0%')), true, 'Genuine probability zero remains a real result');
    assert.equal(await b.evaluate(has('1 saved attribution records lack', model)), true);
    assert.equal(await b.evaluate('Boolean(window.xaiInjected)'), false);
    await change('[aria-label="Search explanations"]', 'email_event_count');
    await waitUntil(b, `${model}.querySelectorAll('article').length===1`, 'SHAP search');
    await change('[aria-label="Search explanations"]', 'off-hours');
    await waitUntil(b, `${contextual}.querySelectorAll('article').length===1 && ${has('No model explanations match your search.', model)}`, 'contextual evidence search');
    await change('[aria-label="Search explanations"]', 'no-such-feature');
    await waitUntil(b, has('No contextual factors match your search.', contextual), 'unmatched query');
    await change('[aria-label="Search explanations"]', '');
    fail = true; await refresh();
    await waitUntil(b, `${settled} && ${has('HTTP 503')}`, 'failed refresh is visibly stale');
    assert.equal(await b.evaluate(has('SHAP +0.1200', model)), true);
    fail = false; await refresh();
    await waitUntil(b, `${settled} && !${has('HTTP 503')}`, 'refresh recovery');
    await choose(f.employee2.id);
    await waitUntil(b, `${settled} && ${has('No activity is recorded for this employee', contextual)}`, 'employee with no telemetry');
    assert.equal(await b.evaluate(has('SHAP +0.1200')), false);
    await choose(f.employee.id);
    await waitUntil(b, `${settled} && ${has('SHAP +0.1200', model)}`, 'original employee restored');
    slow = true; await choose(f.employee2.id); await new Promise(resolve => setTimeout(resolve, 100)); await choose(f.employee.id);
    await new Promise(resolve => setTimeout(resolve, 750));
    await waitUntil(b, `${settled} && ${has('SHAP +0.1200', model)}`, 'selection race cannot overwrite employee');
    const denied = await fetch(`${origin}/api/risk/analysis/${f.foreign.id}`, { headers: { Authorization: `Bearer ${generateJwtToken(f.admin, true)}` } });
    assert.equal(denied.status, 404);
    assert.deepEqual(exceptions, []);
  } finally {
    if (previousTimezone === undefined) delete process.env.SECURITY_TIMEZONE; else process.env.SECURITY_TIMEZONE = previousTimezone;
    if (b) await b.close();
    if (sse) { for (const client of sse.clients) client.end(); clearInterval(sse.heartbeatInterval); }
    if (server) await new Promise(resolve => server.close(resolve));
    await f.close();
    if (profile && path.dirname(profile) === os.tmpdir()) await fs.rm(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }
});
