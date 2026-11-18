import {test} from 'node:test';
import assert from 'node:assert/strict';
import {monitoredUser, monitoringInclude} from '../services/monitoring-state.js';

const fresh = () => ({status:'ACTIVE',riskScore:0,trustScore:90,passwordHash:'private',
  _count:{activityEvents:0,trustHistories:0,riskScores:0,devices:0,endpointDevices:0},sessions:[]});
test('untouched registration does not present default risk or trust as measurements', () => {
  const input=fresh(), result=monitoredUser(input);
  assert.equal(result.currentTrustScore,null);
  assert.equal(result.trustScore,null);
  assert.equal(result.currentRiskScore,null);
  assert.equal(result.riskScore,null);
  assert.equal(input.trustScore,90);
  assert.equal(result.assessmentStatus,'NOT_ASSESSED');
  assert.equal(result.scoreBasis,'UNASSESSED');
  assert.equal(result.hasActiveConsoleSession,false);
  for(const field of ['passwordHash','sessions','_count']) assert.equal(field in result,false);
});
test('observed or restricted scores are never reset by presentation', () => {
  const risk=fresh();risk._count.riskScores=1;
  assert.equal(monitoredUser(risk).currentRiskScore,0);
  assert.equal(monitoredUser(risk).currentTrustScore,null);
  const trust=fresh();trust._count.trustHistories=1;
  assert.equal(monitoredUser(trust).currentTrustScore,null,'unchanged registration trust is not assessed merely because a history row exists');
  assert.equal(monitoredUser(trust).currentRiskScore,null);
  for(const status of ['FROZEN','DISABLED','RESTRICTED'])
    assert.equal(monitoredUser({...fresh(),status,sessions:[{id:'x'}]}).hasActiveConsoleSession,false);
  assert.equal(monitoredUser({...fresh(),riskScore:20,trustScore:60}).currentTrustScore,null);
  assert.equal(monitoredUser({...fresh(),trustUpdatedAt:new Date()}).currentTrustScore,90);
});
test('latest persisted assessment rows are displayed even when compatibility markers are stale', () => {
  const input={...fresh(),riskScore:0,trustScore:100,
    riskScores:[{score:47,level:'MEDIUM',timestamp:new Date('2026-11-01T00:00:00Z')}],
    trustHistories:[{trustScore:73,riskScore:47,timestamp:new Date('2026-11-01T00:00:00Z')}]};
  const result=monitoredUser(input);
  assert.equal(result.riskScore,47);
  assert.equal(result.currentRiskLevel,'MEDIUM');
  assert.equal(result.trustScore,73);
  assert.equal(result.currentTrustScore,73);
  assert.equal(result.assessmentStatus,'ASSESSED');
});
test('session status uses filtered live sessions, not enabled account status', () => {
  const query=monitoringInclude();
  assert.equal(query.sessions.where.revokedAt,null);
  assert.ok(query.sessions.where.expiresAt.gt instanceof Date);
  assert.equal(monitoredUser({...fresh(),sessions:[{id:'x'}]}).hasActiveConsoleSession,true);
});

test('assignment and heartbeats do not deduct initial trust or prove a risk assessment', () => {
  const now=Date.now();
  for(const device of [{enrolledAt:null,lastSeen:null}, {enrolledAt:new Date(now-7200000),lastSeen:new Date(now-600000)}]) {
    const input={...fresh(),endpointDevices:[device]};
    input._count.endpointDevices=1;
    const result=monitoredUser(input,now);
    assert.equal(result.currentTrustScore,null);
    assert.equal(result.currentRiskScore,null);
    assert.equal(result.assessmentStatus,'NOT_ASSESSED');
    assert.equal(result.agentConnectionStatus,device.enrolledAt?'OFFLINE':'UNENROLLED');
    assert.equal('endpointDevices' in result,false);
  }
});

test('agent connection follows recent non-revoked heartbeat, independently of console sessions', () => {
  const now=Date.now(), device={enrolledAt:new Date(now-7200000),revokedAt:null};
  const state=devices=>monitoredUser({...fresh(),endpointDevices:devices},now);
  assert.equal(state([]).agentConnectionStatus,'NOT_ASSIGNED');
  for(const [age,status] of [[30000,'CONNECTED'],[120000,'STALE'],[600000,'OFFLINE']]) {
    const result=state([{...device,lastSeen:new Date(now-age)}]);
    assert.equal(result.agentConnectionStatus,status);
    assert.equal(result.agentLastSeen,new Date(now-age).toISOString());
    assert.equal(result.hasActiveConsoleSession,false);
  }
  assert.equal(state([{...device,lastSeen:null}]).agentConnectionStatus,'OFFLINE');
  const revoked={...device,lastSeen:new Date(now),revokedAt:new Date(now)};
  assert.equal(state([revoked]).agentConnectionStatus,'REVOKED');
  assert.equal(state([revoked,{...device,lastSeen:new Date(now-600000)}]).agentConnectionStatus,'OFFLINE');
});
