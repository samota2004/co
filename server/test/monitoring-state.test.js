import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitoredUser, monitoringInclude} from '../services/monitoring-state.js';

const fresh = () => ({status:'ACTIVE',riskScore:0,trustScore:90,passwordHash:'private',
  _count:{activityEvents:0,trustHistories:0,riskScores:0,devices:0,endpointDevices:0},sessions:[]});
test('untouched legacy registration shows initial trust, no assessment and no invented session', () => {
  const input=fresh(), result=monitoredUser(input);
  assert.equal(result.currentTrustScore,100);
  assert.equal(input.trustScore,90);
  assert.equal(result.assessmentStatus,'NOT_ASSESSED');
  assert.equal(result.hasActiveConsoleSession,false);
  for(const field of ['passwordHash','sessions','_count']) assert.equal(field in result,false);
});
test('observed or restricted scores are never reset by presentation', () => {
  for(const field of ['activityEvents','trustHistories','riskScores','devices','endpointDevices']) {
    const input=fresh();input._count[field]=1;
    assert.equal(monitoredUser(input).currentTrustScore,90);
  }
  for(const status of ['FROZEN','DISABLED','RESTRICTED'])
    assert.equal(monitoredUser({...fresh(),status,sessions:[{id:'x'}]}).hasActiveConsoleSession,false);
  assert.equal(monitoredUser({...fresh(),riskScore:20,trustScore:60}).currentTrustScore,60);
  assert.equal(monitoredUser({...fresh(),trustUpdatedAt:new Date()}).assessmentStatus,'ASSESSED');
});
test('session status uses filtered live sessions, not enabled account status', () => {
  const query=monitoringInclude();
  assert.equal(query.sessions.where.revokedAt,null);
  assert.ok(query.sessions.where.expiresAt.gt instanceof Date);
  assert.equal(monitoredUser({...fresh(),sessions:[{id:'x'}]}).hasActiveConsoleSession,true);
});
