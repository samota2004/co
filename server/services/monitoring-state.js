import {publicUser} from './security-common.js';

export const monitoringInclude = () => ({
  _count: {select: {activityEvents:true, trustHistories:true, riskScores:true, devices:true, endpointDevices:true}},
  sessions: {where:{revokedAt:null, expiresAt:{gt:new Date()}}, select:{id:true}, take:1},
});

export function monitoredUser(user) {
  const {_count, sessions, ...record} = user;
  const result = publicUser(record);
  const assessed = Boolean(_count?.activityEvents || _count?.trustHistories || _count?.riskScores || user.trustUpdatedAt);
  // Correct only the old untouched registration baseline in the presentation.
  // Never raise persisted authorization trust or erase an assessed/restricted score.
  const initial = _count && !assessed && !_count.devices && !_count.endpointDevices &&
    user.status === 'ACTIVE' && user.riskScore === 0 && [90,100].includes(user.trustScore);
  return {...result,
    ...(initial ? {currentTrustScore:100} : {}),
    assessmentStatus: assessed ? 'ASSESSED' : 'NOT_ASSESSED',
    scoreBasis: initial ? 'INITIAL_BASELINE' : 'STORED_SCORE',
    hasActiveConsoleSession: user.status === 'ACTIVE' && Boolean(sessions?.length),
  };
}
