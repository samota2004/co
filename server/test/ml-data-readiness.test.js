import {test} from 'node:test';
import assert from 'node:assert/strict';
import {featureSchema} from '../services/ml-service.js';
import {createLiveModelDataReadiness,parseReadinessDate,LIVE_READINESS_VERSION} from '../services/ml-data-readiness.js';

test('live employee telemetry reports incomplete notebook-compatible model coverage without zero filling',()=>{
  const readiness=createLiveModelDataReadiness();
  assert.equal(readiness.status,'INSUFFICIENT_FOR_MODEL');
  assert.equal(readiness.version,LIVE_READINESS_VERSION);
  assert.equal(readiness.complete,false);
  assert.equal(readiness.featureCount,21);
  assert.equal(readiness.compatibleFeatureCount,0);
  assert.deepEqual(readiness.features.map(feature=>feature.name),featureSchema.feature_names);
  assert.equal(readiness.derivableFeatureCount,2);
  assert.equal(readiness.missingCompatibleFeatureCount,19);
  for(const name of ['file_content_events','unique_http_content','unique_recipients','email_size_total','attachments_total']) {
    const feature=readiness.features.find(item=>item.name===name);
    assert.equal(feature.status,'MISSING_COMPATIBLE_SOURCE',name);
    assert.ok(feature.source,name);
  }
  assert.match(readiness.nextSteps[1],/Do not infer/);
});

test('readiness uses a strict UTC day window and the notebook Monday-zero weekday convention',()=>{
  const window=parseReadinessDate('2026-10-24',new Date('2026-10-24T12:00:00Z'));
  assert.equal(window.start.toISOString(),'2026-10-24T00:00:00.000Z');
  assert.equal(window.end.toISOString(),'2026-10-25T00:00:00.000Z');
  assert.equal(window.dayOfWeek,5);
  assert.equal(window.isWeekend,1);
  assert.equal(window.state,'OPEN');
  assert.throws(()=>parseReadinessDate('2026-02-30',new Date('2026-10-24T12:00:00Z')),/valid calendar date/);
  assert.throws(()=>parseReadinessDate('2026-10-25',new Date('2026-10-24T12:00:00Z')),/future/);
  assert.throws(()=>parseReadinessDate(['2026-10-24'],new Date('2026-10-24T12:00:00Z')),/YYYY-MM-DD/);
});
