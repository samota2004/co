import {test} from 'node:test';
import assert from 'node:assert/strict';
import {featureSchema,validateFeatures} from '../services/ml-service.js';

const completeSyntheticAggregate=()=>Object.fromEntries(featureSchema.feature_names.map(name=>[name,0]));

test('complete named aggregate is validated and normalized to the exact saved feature order',()=>{
  const supplied=Object.fromEntries(Object.entries(completeSyntheticAggregate()).reverse());
  const normalized=validateFeatures(supplied);
  assert.deepEqual(Object.keys(normalized),featureSchema.feature_names);
  assert.equal(Object.keys(normalized).length,21);
});

test('unordered positional vectors and mismatched schemas are rejected before inference',()=>{
  const values=Object.values(completeSyntheticAggregate());
  assert.throws(()=>validateFeatures(values),error=>error.code==='INVALID_FEATURES');
  assert.throws(()=>validateFeatures({...completeSyntheticAggregate(),unexpected:1}),error=>error.code==='FEATURE_SCHEMA_MISMATCH');
  const incomplete=completeSyntheticAggregate();delete incomplete.unique_recipients;
  assert.throws(()=>validateFeatures(incomplete),error=>error.code==='ML_DATA_INCOMPLETE'&&error.details.missingFeatures.includes('unique_recipients'));
});

test('rejects feature vectors whose notebook-derived aggregate relationships are inconsistent',()=>{
  const features=completeSyntheticAggregate();
  features.logon_count=1;
  assert.throws(()=>validateFeatures(features),error=>error.code==='INVALID_FEATURE_VALUE'&&/total_activity/.test(error.message));
  const badWeekend=completeSyntheticAggregate();badWeekend.day_of_week=5;
  assert.throws(()=>validateFeatures(badWeekend),error=>error.code==='INVALID_FEATURE_VALUE'&&/is_weekend/.test(error.message));
  const impossibleUnique=completeSyntheticAggregate();impossibleUnique.file_event_count=1;impossibleUnique.total_activity=1;impossibleUnique.cross_source_activity=1;impossibleUnique.unique_files=2;
  assert.throws(()=>validateFeatures(impossibleUnique),error=>error.code==='INVALID_FEATURE_VALUE'&&/unique_files/.test(error.message));
  const fractionalCount=completeSyntheticAggregate();fractionalCount.device_event_count=.5;
  assert.throws(()=>validateFeatures(fractionalCount),error=>error.code==='INVALID_FEATURE_VALUE'&&/integer/.test(error.message));
});
