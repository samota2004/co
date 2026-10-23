import {test} from 'node:test';
import assert from 'node:assert/strict';
import {featureSchema,validateFeatures} from '../services/ml-service.js';

const completeSyntheticAggregate=()=>Object.fromEntries(featureSchema.feature_names.map(name=>[name,name==='day_of_week'?0:name==='is_weekend'?0:1]));

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
