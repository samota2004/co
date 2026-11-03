import assert from 'node:assert/strict';
import { updateFeatureState, getUserDayFeatures, getLatestUserDayFeatures, featureState } from './ml-feature-aggregator.js';

const events = [
  {
    eventId: "test-1",
    userId: "user-001",
    timestamp: "2026-09-15T10:00:00.000Z",
    eventType: "LOGIN",
    deviceId: "dev-001"
  },
  {
    eventId: "test-2",
    userId: "user-001",
    timestamp: "2026-09-15T10:10:00.000Z",
    eventType: "FILE_ACCESS",
    deviceId: "dev-001",
    resourceId: "file-001"
  },
  {
    eventId: "test-3",
    userId: "user-001",
    timestamp: "2026-09-15T10:20:00.000Z",
    eventType: "SHELL_EXECUTION",
    deviceId: "dev-001",
    destinationSite: "github.com",
    applicationShellCmd: "git pull"
  },
  {
    eventId: "test-4",
    userId: "user-001",
    timestamp: "2026-09-15T10:30:00.000Z",
    eventType: "FILE_DOWNLOAD",
    deviceId: "dev-001",
    resourceId: "file-002"
  }
];

for (const event of events) assert.throws(() => updateFeatureState(featureState, event), error => error.code === 'ML_DATA_INCOMPLETE');
assert.equal(featureState.size, 0);
assert.equal(getUserDayFeatures(featureState, 'user-001', '2026-09-15'), null);
assert.equal(getLatestUserDayFeatures(featureState, 'user-001'), null);
console.log('Endpoint-to-CERT pseudo-aggregation rejection: PASSED');
