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
  const assessed = Boolean(_count?.activityEvents || _count?.trustHistories || _count?.riskScores || user.trustUpdatedAt);
  // Correct only the old untouched registration baseline in the presentation.
  // Never raise persisted authorization trust or erase an assessed/restricted score.
  const initial = _count && !assessed &&
    user.status === 'ACTIVE' && user.riskScore === 0 && [90,100].includes(user.trustScore);
  const enrolled = endpointDevices.filter(d => d.enrolledAt && !d.revokedAt);
  const contacts = enrolled.map(d => new Date(d.lastSeen || 0).getTime()).filter(t => Number.isFinite(t) && t > 0);
  const lastContact = contacts.length ? Math.max(...contacts) : null;
  const connection = !endpointDevices.length ? 'NOT_ASSIGNED' : !enrolled.length ?
    (endpointDevices.every(d => d.revokedAt) ? 'REVOKED' : 'UNENROLLED') :
    !lastContact || now - lastContact > 300000 ? 'OFFLINE' : now - lastContact > 90000 ? 'STALE' : 'CONNECTED';
  return {...result,
    ...(initial ? {currentTrustScore:100} : {}),
    assessmentStatus: assessed ? 'ASSESSED' : 'NOT_ASSESSED',
    scoreBasis: initial ? 'INITIAL_BASELINE' : 'STORED_SCORE',
    hasActiveConsoleSession: user.status === 'ACTIVE' && Boolean(sessions?.length),
    agentConnectionStatus: connection,
    agentLastSeen: lastContact ? new Date(lastContact).toISOString() : null,
  };
}
