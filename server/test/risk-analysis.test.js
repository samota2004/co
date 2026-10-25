import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRiskWindow } from '../services/risk-analysis-service.js';
import { DEFAULT_POLICY } from '../services/policy-service.js';

// Use a declared UTC policy clock for deterministic access-hour fixtures.
process.env.SECURITY_TIMEZONE = 'UTC';
const at = new Date('2026-10-13T12:30:00Z');
const user = { id: 'employee', trustScore: 100 };
const group = (type, count, userId = null) => ({ type, userId, _count: { _all: count } });
const analyse = overrides => analyzeRiskWindow({ user, activeEvents: [], counts: [], securityEvents: [], securityCount: 0, trust: null, baseline: null, policy: DEFAULT_POLICY, at, ...overrides });

test('absence of evidence and stored trust stays unavailable instead of becoming a fabricated measurement', () => {
  const result = analyse({ user: { id: user.id } });
  assert.equal(result.hasTelemetry, false);
  assert.equal(result.riskScore, null);
  assert.equal(result.trustScore, null);
  assert.equal(result.trustBasis, 'UNASSESSED');
  assert.equal(result.ml.probability, null);
  assert.ok(result.history.every(point => point.score === null));
});

test('live observed risk and stored account policy risk remain separate and explicit', () => {
  const result = analyse({
    user: { ...user, riskScore: 51, riskLevel: 'MEDIUM' },
    activeEvents: [{ type: 'APPLICATION_USAGE', userId: user.id, occurredAt: new Date('2026-10-12T23:00:00Z') }],
    counts: [group('APPLICATION_USAGE', 1, user.id)],
  });
  assert.equal(result.riskScore, 20, '24-hour observed score follows the configured off-hours evidence');
  assert.deepEqual(result.accountRisk, { score: 51, level: 'MEDIUM' }, 'persisted account score remains available for policy context');
});

test('background processes, attached USB, file changes and connections do not become fabricated threats', () => {
  const result = analyse({ counts: [group('PROCESS_RUNNING', 16000), group('USB_CONNECTED', 1), group('FILE_CHANGE', 20), group('NETWORK_CONNECTION', 3)] });
  assert.equal(result.riskScore, 0);
  assert.deepEqual(result.contributingFactors, []);
  assert.equal(result.coverage.endpointEvents, 16024);
  assert.equal(result.coverage.verifiedEvents, 0);
  assert.equal(result.vectors.find(vector => vector.name === 'Data transfer').status, 'Unavailable');
  assert.equal(result.trustScore, 100);
  assert.equal(result.trustBasis, 'ACCOUNT_BASELINE');
  assert.equal(result.ml.available, false);
  assert.ok(result.history.every(point => point.score === null));
});

test('off-hours interactive observations use policy weights once and distinguish verified from device-wide evidence', () => {
  const rows = [
    { type: 'APPLICATION_USAGE', userId: user.id, occurredAt: new Date('2026-10-12T23:00:00Z') },
    { type: 'APPLICATION_FOREGROUND', userId: null, occurredAt: new Date('2026-10-12T23:01:00Z') },
    { type: 'SESSION_LOGIN', userId: user.id, occurredAt: new Date('2026-10-13T10:00:00Z') },
  ];
  const result = analyse({ activeEvents: rows, counts: [group('APPLICATION_USAGE', 1, user.id), group('APPLICATION_FOREGROUND', 1), group('SESSION_LOGIN', 1, user.id)], policy: { ...DEFAULT_POLICY, offHoursPenalty: 17 } });
  assert.equal(result.riskScore, 17);
  assert.equal(result.coverage.offHoursEvents, 2);
  assert.equal(result.coverage.verifiedEvents, 2);
  assert.equal(result.contributingFactors.length, 1);
  assert.match(result.contributingFactors[0].description, /1 attributed to the employee and 1 device-wide/);
  assert.equal(result.history.find(point => point.time === '2026-10-12T22:30:00.000Z').score, 17);
  assert.equal(result.history.find(point => point.time === '2026-10-13T09:30:00.000Z').score, 0);
  assert.equal(result.ml.available, false);
});

test('learned hours and a declared timezone govern timing risk', () => {
  process.env.SECURITY_TIMEZONE = 'Asia/Kolkata';
  try {
    const result = analyse({ activeEvents: [{ userId: user.id, occurredAt: new Date('2026-10-13T04:30:00Z') }], counts: [group('APPLICATION_USAGE', 1, user.id)], baseline: { sampleDays: 8, statistics: {}, normalStartHour: 10, normalEndHour: 20 } });
    assert.equal(result.riskScore, 0);
    assert.equal(result.window.timezone, 'Asia/Kolkata');
    assert.equal(result.baselineBasis, 'Learned historical access hours');
  } finally { process.env.SECURITY_TIMEZONE = 'UTC'; }
});

test('strongest recorded assessment, recorded trust and actual model probability remain separate measurements', () => {
  const timestamp = new Date('2026-10-13T10:00:00Z');
  const result = analyse({ securityEvents: [
    { type: 'FILE_DOWNLOAD', timestamp, riskContribution: 70, metadata: { evaluation: { riskScore: 70, contributingFactors: [{ factor: 'Abnormal download volume', category: 'VOLUME', scoreImpact: 70 }], explanationText: 'Recorded download risk.' }, ml: { threat_probability: 0.73, xai_reasons: ['Recorded attribution'] } } },
    { type: 'LOGIN_SUCCESS', timestamp: new Date('2026-10-13T09:00:00Z'), riskContribution: 0, metadata: {} },
  ], securityCount: 2, trust: { trustScore: 86, timestamp } });
  assert.equal(result.riskScore, 70);
  assert.equal(result.riskLevel, 'HIGH');
  assert.equal(result.trustScore, 86);
  assert.equal(result.source, 'Recorded security assessment');
  assert.equal(result.ml.probability, 0.73);
  assert.equal(result.history.find(point => point.time === '2026-10-13T09:30:00.000Z').mlProb, 73);
  assert.equal(result.coverage.status, 'Partial');
});

test('bounded evidence is disclosed even when the aggregate counts are complete', () => {
  const result = analyse({ counts: [group('APPLICATION_USAGE', 9000, user.id)], truncated: true });
  assert.equal(result.coverage.endpointEvents, 9000);
  assert.equal(result.coverage.truncated, true);
});

test('recorded assessment factors establish coverage even when the event type is generic', () => {
  const result = analyse({ securityCount: 1, securityEvents: [{ type: 'RESOURCE_ACCESS', timestamp: at, riskContribution: 60, metadata: { evaluation: { riskScore: 60, contributingFactors: ['AUTH', 'VOLUME', 'PRIVILEGE'].map(category => ({ category, factor: category, scoreImpact: 20 })) } } }] });
  for (const name of ['Authentication', 'Data transfer', 'Privilege changes']) assert.equal(result.vectors.find(vector => vector.name === name).status, 'Observed');
});

test('stored account trust is returned without inventing an adaptive assessment or replacing a valid zero', () => {
  for (const value of [0, 100]) {
    const result = analyse({ user: { ...user, trustScore: value } });
    assert.equal(result.trustScore, value);
    assert.equal(result.trustBasis, 'ACCOUNT_BASELINE');
    assert.equal(result.trustTimestamp, null);
  }
  const timestamp = new Date('2026-10-13T10:00:00Z');
  const result = analyse({ user: { ...user, trustScore: 79, trustUpdatedAt: timestamp }, trust: { trustScore: 86, timestamp: new Date('2026-10-13T09:00:00Z') } });
  assert.equal(result.trustScore, 79);
  assert.equal(result.trustBasis, 'STORED_ASSESSMENT');
  assert.equal(result.trustTimestamp, timestamp);
});

test('persisted approved-model predictions outside the activity window remain available with their original timestamp', () => {
  const timestamp = new Date('2026-10-11T10:00:00Z');
  const result = analyse({ prediction: { anomalyScore: 0, timestamp, attributions: [] } });
  assert.equal(result.ml.available, true);
  assert.equal(result.ml.status, 'RECORDED_PREDICTION');
  assert.equal(result.ml.probability, 0);
  assert.match(result.ml.scoreMeaning,/Uncalibrated positive-class Random Forest score/);
  assert.equal(result.ml.timestamp, timestamp);
  assert.ok(result.history.every(point => point.mlProb === null));
});

test('newest valid model result wins and invalid probabilities remain awaiting inputs', () => {
  const event = { type: 'MODEL_ASSESSMENT', timestamp: new Date('2026-10-13T11:00:00Z'), metadata: { ml: { threat_probability: 0.42 } } };
  const result = analyse({ securityCount: 1, securityEvents: [event], prediction: { anomalyScore: 0.81, timestamp: new Date('2026-10-13T09:00:00Z') } });
  assert.equal(result.ml.probability, 0.42);
  const invalid = analyse({ prediction: { anomalyScore: 2, timestamp: at } });
  assert.equal(invalid.ml.available, false);
  assert.equal(invalid.ml.status, 'AWAITING_INPUTS');
  assert.equal(invalid.ml.probability, null);
});
