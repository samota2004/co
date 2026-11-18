import {publicUser} from './security-common.js';

export const monitoringInclude = () => ({
  _count: {select: {activityEvents:true, trustHistories:true, riskScores:true, devices:true, endpointDevices:true}},
  sessions: {where:{revokedAt:null, expiresAt:{gt:new Date()}}, select:{id:true}, take:1},
  endpointDevices: {select:{enrolledAt:true, revokedAt:true, lastSeen:true}},
  // The scalar User values are compatibility fields. The most recent durable
  // assessment rows are the source of truth for what monitoring may display.
  riskScores: {orderBy:{timestamp:'desc'}, select:{score:true,level:true,timestamp:true}, take:1},
  trustHistories: {orderBy:{timestamp:'desc'}, select:{trustScore:true,riskScore:true,timestamp:true}, take:1},
});

export function monitoredUser(user) {
  const now = Date.now();
  const {_count, sessions, endpointDevices = [], riskScores = [], trustHistories = [], ...record} = user;
  const result = publicUser(record);
  // Registration defaults and endpoint heartbeats are not measured risk or trust.
  // Keep persisted policy state intact, but never present it as an assessment.
  const latestRisk = riskScores[0] || null;
  const latestTrust = trustHistories[0] || null;
  const riskAssessed = Boolean(_count?.riskScores || latestRisk);
  const trustAssessed = Boolean(user.trustUpdatedAt || latestTrust);
  const measuredRisk = riskAssessed ? latestRisk?.score ?? user.riskScore : null;
  const measuredRiskLevel = riskAssessed ? latestRisk?.level ?? user.riskLevel : null;
  const measuredTrust = trustAssessed
    ? latestTrust?.trustScore ?? user.trustScore
    : null;
  const assessed = riskAssessed || trustAssessed;
  const enrolled = endpointDevices.filter(d => d.enrolledAt && !d.revokedAt);
  const contacts = enrolled.map(d => new Date(d.lastSeen || 0).getTime()).filter(t => Number.isFinite(t) && t > 0);
  const lastContact = contacts.length ? Math.max(...contacts) : null;
  const connection = !endpointDevices.length ? 'NOT_ASSIGNED' : !enrolled.length ?
    (endpointDevices.every(d => d.revokedAt) ? 'REVOKED' : 'UNENROLLED') :
    !lastContact || now - lastContact > 300000 ? 'OFFLINE' : now - lastContact > 90000 ? 'STALE' : 'CONNECTED';
  return {...result,
    riskScore: measuredRisk,
    currentRiskScore: measuredRisk,
    riskLevel: measuredRiskLevel,
    currentRiskLevel: measuredRiskLevel,
    trustScore: measuredTrust,
    currentTrustScore: measuredTrust,
    assessmentStatus: assessed ? 'ASSESSED' : 'NOT_ASSESSED',
    scoreBasis: assessed ? 'RECORDED_ASSESSMENT' : 'UNASSESSED',
    hasActiveConsoleSession: user.status === 'ACTIVE' && Boolean(sessions?.length),
    agentConnectionStatus: connection,
    agentLastSeen: lastContact ? new Date(lastContact).toISOString() : null,
  };
}
