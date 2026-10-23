import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSequence} from '../../ml/research/policy_eval.mjs';

const example=(id, overrides={})=>({event_id:id,user_id:'SYNTHETIC-1',timestamp:'2025-01-01T10:00:00Z',
  label:0,risk_score:10,context_risk_score:10,trust_score:90,status:'ACTIVE',role_code:'EMPLOYEE',
  resource:{id:'r1',sensitivity:'CONFIDENTIAL',requiredRoles:['EMPLOYEE']},mfa_fresh:false,
  approval:false,critical_hold:false,uncertain:false,synthetic:true,...overrides});

test('offline policy comparison keeps compulsory holds and exposes trust/uncertainty effects',()=>{
  const input=[example('1'),example('2',{timestamp:'2025-01-01T10:01:00Z',trust_score:40}),
    example('3',{timestamp:'2025-01-01T10:02:00Z',uncertain:true}),
    example('4',{timestamp:'2025-01-01T10:03:00Z',label:1,risk_score:95,critical_hold:true})];
  const result=evaluateSequence(input);
  assert.equal(result.decisions.risk_only[1].decision,'ALLOW');
  assert.equal(result.decisions.risk_plus_trust[1].decision,'REQUIRE_APPROVAL');
  assert.equal(result.decisions.conservative_review[2].decision,'REQUIRE_APPROVAL');
  for(const rows of Object.values(result.decisions))assert.equal(rows[3].decision,'FREEZE');
  assert.equal(result.summary.risk_plus_trust.legitimate_challenged_or_denied,1);
  assert.equal(result.summary.risk_plus_trust.threat_labelled_allowed,0);
});

test('offline evaluator rejects duplicate IDs, out-of-order events and invalid scores',()=>{
  assert.throws(()=>evaluateSequence([example('1'),example('1')]),/Invalid or out-of-order/);
  assert.throws(()=>evaluateSequence([example('1'),example('2',{timestamp:'2024-01-01T00:00:00Z'})]),/Invalid or out-of-order/);
  assert.throws(()=>evaluateSequence([example('1',{risk_score:101})]),/Invalid or out-of-order/);
});

test('reviewed approval cannot bypass a required resource role in replay',()=>{
  const result=evaluateSequence([example('unauthorized',{approval:true,role_code:'MANAGER'})]);
  for(const rows of Object.values(result.decisions))assert.equal(rows[0].decision,'RESTRICT');
});

test('replay separates false challenges, denials, missed threats and repeated alerts',()=>{
  const rows=[example('challenge',{risk_score:60}),
    example('duplicate',{timestamp:'2025-01-01T10:01:00Z',risk_score:60}),
    example('denial',{timestamp:'2025-01-01T10:02:00Z',status:'RESTRICTED'}),
    example('missed',{timestamp:'2025-01-01T10:03:00Z',label:1}),
    example('held',{timestamp:'2025-01-01T10:04:00Z',label:1,critical_hold:true,trust_score:95})];
  const {summary}=evaluateSequence(rows);
  assert.equal(summary.risk_plus_trust.legitimate_challenged,2);
  assert.equal(summary.risk_plus_trust.legitimate_denied,1);
  assert.equal(summary.risk_plus_trust.threat_labelled_allowed,1);
  assert.equal(summary.risk_plus_trust.threat_labelled_contained,1);
  assert.equal(summary.risk_plus_trust.repeated_alerts_within_15_minutes,1);
  assert.equal(summary.risk_plus_trust.trust_increases_while_held,1);
});
