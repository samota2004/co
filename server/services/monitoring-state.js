import {publicUser} from './security-common.js';

export const monitoringInclude = () => ({
  _count: {select: {activityEvents:true, trustHistories:true, riskScores:true, devices:true, endpointDevices:true}},
  sessions: {where:{revokedAt:null, expiresAt:{gt:new Date()}}, select:{id:true}, take:1},
  endpointDevices: {select:{enrolledAt:true, revokedAt:true, lastSeen:true}},
});

export function monitoredUser(user) {
  const now = Date.now();
  const {_count, sessions, endpointDevices = [], ...record} = user;
  const result = publicUser(record);
  // Registration defaults and endpoint heartbeats are not measured risk or trust.
  // Keep persisted policy state intact, but never present it as an assessment.
  const riskAssessed = Boolean(_count?.riskScores);
  const trustAssessed = Boolean(user.trustUpdatedAt);
  const assessed = riskAssessed || trustAssessed;
  const enrolled = endpointDevices.filter(d => d.enrolledAt && !d.revokedAt);
  const contacts = enrolled.map(d => new Date(d.lastSeen || 0).getTime()).filter(t => Number.isFinite(t) && t > 0);
  const lastContact = contacts.length ? Math.max(...contacts) : null;
  const connection = !endpointDevices.length ? 'NOT_ASSIGNED' : !enrolled.length ?
    (endpointDevices.every(d => d.revokedAt) ? 'REVOKED' : 'UNENROLLED') :
    !lastContact || now - lastContact > 300000 ? 'OFFLINE' : now - lastContact > 90000 ? 'STALE' : 'CONNECTED';
  return {...result,
    ...(!riskAssessed ? {riskScore:null,currentRiskScore:null,riskLevel:null,currentRiskLevel:null} : {}),
    ...(!trustAssessed ? {trustScore:null,currentTrustScore:null} : {}),
    assessmentStatus: assessed ? 'ASSESSED' : 'NOT_ASSESSED',
    scoreBasis: assessed ? 'RECORDED_ASSESSMENT' : 'UNASSESSED',
    hasActiveConsoleSession: user.status === 'ACTIVE' && Boolean(sessions?.length),
    agentConnectionStatus: connection,
    agentLastSeen: lastContact ? new Date(lastContact).toISOString() : null,
  };
}
