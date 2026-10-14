import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAttributions, formatNumber, formatShap, matchesExplanation } from '../../client/src/services/xai.js';

test('SHAP direction follows numeric contributions and preserves zero values', () => {
  const result = normalizeAttributions([
    { feature: 'email_event_count', value: 0, shap_value: .1, impact: 'decreases threat' },
    { feature: 'logon_count', value: 3, shap_value: -.2 },
    { feature: 'day_of_week', value: 0, shap_value: 0 },
  ]);
  assert.deepEqual(result.contributions.map(item => item.impact), ['increases threat', 'decreases threat', 'no directional change']);
  assert.equal(formatNumber(result.contributions[0].value), '0');
  assert.equal(formatShap(result.contributions[2].shap_value), '+0.0000');
});
test('missing and malformed SHAP data cannot be coerced into fabricated zero contributions', () => {
  const result = normalizeAttributions([null, { feature: 'missing', shap_value: null }, { feature: 'text', shap_value: '.1' }, { feature: 'infinite', shap_value: Infinity }, { shap_value: 1 }]);
  assert.equal(result.contributions.length, 0);
  assert.equal(result.invalidCount, 5);
  assert.equal(formatNumber(null), 'Not recorded');
  assert.equal(formatShap(undefined), 'Not recorded');
  assert.deepEqual(normalizeAttributions(null).contributions, []);
});
test('saved text summaries retain their provenance without invented numeric SHAP values', () => {
  const result = normalizeAttributions([' Recorded summary ', { feature: 'file_count', shap_value: .2 }]);
  assert.deepEqual(result.summaries, ['Recorded summary']);
  assert.equal(result.contributions.length, 1);
  assert.equal(result.contributions[0].value, undefined);
});
test('explanation search includes factor evidence and preserves searchable zeros', () => {
  assert.equal(matchesExplanation(['Off-hours interactive activity', '885 observations', 20], 'off-hours'), true);
  assert.equal(matchesExplanation(['logon_count', 0, -.01], '0'), true);
  assert.equal(matchesExplanation([null, undefined], 'null'), false);
});
