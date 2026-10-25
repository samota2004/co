import { riskEngine } from '../../cyber/risk-engine/risk-engine.js';
import { getPolicy, riskLevel } from './policy-service.js';
import { scopedUser, userScope } from './security-common.js';
import { securityTimezone } from './time-context.js';
import { modelMetadata } from './ml-service.js';

const HOUR = 3600000;
const LIMIT = 5000;
const interactiveTypes = ['APPLICATION_USAGE', 'APPLICATION_FOREGROUND', 'SESSION_LOGIN', 'SESSION_UNLOCK'];
const finiteScore = value => typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
const finiteProbability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;

// A read-only view over real observations. Reading the analysis neither imports
// synthetic activity nor changes account trust, policy state or restrictions.
export function analyzeRiskWindow({ user, activeEvents, counts, securityEvents, securityCount, trust, riskAssessment = null, prediction = null, baseline, policy, at = new Date(), truncated = false }) {
  const start = new Date(at.getTime() - 24 * HOUR);
  const endpointCount = counts.reduce((total, group) => total + group._count._all, 0);
  const countType = predicate => counts.filter(group => predicate(group.type)).reduce((total, group) => total + group._count._all, 0);
  const verifiedCount = counts.filter(group => group.userId === user.id).reduce((total, group) => total + group._count._all, 0);
  const profile = baseline?.sampleDays >= 7 && baseline.statistics ? baseline : null;
  const startHour = profile?.normalStartHour ?? 9;
  const endHour = profile?.normalEndHour ?? 18;
  const hourFormatter = new Intl.DateTimeFormat('en-GB', { timeZone: securityTimezone(), hour: '2-digit', hourCycle: 'h23' });
  const outsideHours = event => {
    const hour = Number(hourFormatter.format(new Date(event.occurredAt)));
    return hour < startHour || hour >= endHour;
  };
  const verifiedInteractive = activeEvents.filter(event => event.userId === user.id);
  const offHours = verifiedInteractive.filter(outsideHours);
  const evaluateEndpoint = rows => {
    const elevated = rows.filter(outsideHours);
    const result = riskEngine.evaluateRisk({ ...user, baseline: profile }, {
      timestamp: at.toISOString(), aggregateOnly: true, isOffHours: elevated.length > 0,
    }, undefined, undefined, undefined, policy);
    if (elevated.length) {
      const verified = elevated.filter(event => event.userId === user.id).length;
      result.contributingFactors = result.contributingFactors.map(factor => factor.category !== 'TIME' ? factor : {
        ...factor,
        factor: 'Off-hours interactive activity',
        description: `${elevated.length} interactive observations outside ${startHour}:00–${endHour}:00 (${securityTimezone()}); ${verified} attributed to the employee and ${elevated.length - verified} device-wide. Background process snapshots are excluded.`,
      });
      result.explanationText = result.contributingFactors.map(factor => factor.description).join(' ');
    }
    return result;
  };
  const endpointEvaluation = evaluateEndpoint(verifiedInteractive);
  const assessed = securityEvents.flatMap(event => {
    const evaluation = event.metadata?.evaluation;
    const score = finiteScore(evaluation?.riskScore) ?? finiteScore(event.riskContribution);
    return score === null ? [] : [{ ...evaluation, riskScore: score, contributingFactors: Array.isArray(evaluation?.contributingFactors) ? evaluation.contributingFactors : [], timestamp: event.timestamp, source: 'Recorded security assessment' }];
  });
  const hasTelemetry = verifiedInteractive.length > 0 || assessed.length > 0;
  const candidates = [{ ...endpointEvaluation, source: 'Contextual analysis of assigned-laptop activity' }, ...assessed];
  const strongest = candidates.reduce((current, candidate) => candidate.riskScore >= current.riskScore ? candidate : current);
  const mlCandidates = securityEvents.map(event => ({ probability: finiteProbability(event.metadata?.ml?.threat_probability), timestamp: event.timestamp, reasons: event.metadata?.ml?.xai_reasons ?? [] }));
  if (prediction) mlCandidates.push({ probability: finiteProbability(prediction.anomalyScore), timestamp: prediction.timestamp, reasons: prediction.attributions ?? [] });
  const latestMl = mlCandidates.filter(result => result.probability !== null && Number.isFinite(+new Date(result.timestamp))).sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp))[0] || null;
  const recordedTrust = user.trustUpdatedAt ? finiteScore(trust?.trustScore) : null;
  const storedTrust = user.trustUpdatedAt ? finiteScore(user.trustScore) : null;
  const useStoredTrust = recordedTrust === null || (storedTrust !== null && +new Date(user.trustUpdatedAt) > +new Date(trust?.timestamp));
  const trustScore = useStoredTrust ? storedTrust : recordedTrust;
  const trustBasis = trustScore === null ? 'UNASSESSED' : !useStoredTrust ? 'RECORDED_ASSESSMENT' : user.trustUpdatedAt ? 'STORED_ASSESSMENT' : 'ACCOUNT_BASELINE';
  const history = Array.from({ length: 24 }, (_, index) => {
    const from = start.getTime() + index * HOUR;
    const to = from + HOUR;
    const interactive = verifiedInteractive.filter(event => +new Date(event.occurredAt) >= from && +new Date(event.occurredAt) < to);
    const recorded = assessed.filter(event => +new Date(event.timestamp) >= from && +new Date(event.timestamp) < to);
    const scores = [...(interactive.length ? [evaluateEndpoint(interactive).riskScore] : []), ...recorded.map(event => event.riskScore)];
    const probabilities = securityEvents.filter(event => +new Date(event.timestamp) >= from && +new Date(event.timestamp) < to).map(event => event.metadata?.ml?.threat_probability).filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
    if (prediction && finiteProbability(prediction.anomalyScore) !== null && +new Date(prediction.timestamp) >= from && +new Date(prediction.timestamp) < to) probabilities.push(prediction.anomalyScore);
    return { time: new Date(from).toISOString(), score: scores.length ? Math.max(...scores) : null, mlProb: probabilities.length ? Math.max(...probabilities) * 100 : null };
  });
  // Absence of downloaded-byte/failure/privilege evidence is unknown coverage,
  // rather than a measured zero or a made-up model feature.
  const observedCategory = category => assessed.some(event => event.contributingFactors.some(factor => factor.category === category));
  const vectors = [
    { name: 'Access timing', status: verifiedInteractive.length ? 'Observed' : 'Unavailable', detail: `${verifiedInteractive.length} employee-attributed interactive observations analysed; ${offHours.length} outside normal hours.`, score: verifiedInteractive.length ? endpointEvaluation.riskScore : null },
    { name: 'Authentication', status: observedCategory('AUTH') || securityEvents.some(event => /LOGIN|MFA|PASSWORD/.test(event.type)) ? 'Observed' : 'Unavailable', detail: 'Authentication failure risk uses recorded security assessments. Session presence alone is not a failed login.' },
    { name: 'Data transfer', status: observedCategory('VOLUME') || observedCategory('TRANSFER') || securityEvents.some(event => /DOWNLOAD|USB_TRANSFER|FILE_UPLOAD/.test(event.type)) ? 'Observed' : 'Unavailable', detail: `${countType(type => type === 'FILE_CHANGE')} file-change observations. File changes do not measure read or download volume.` },
    { name: 'Privilege changes', status: observedCategory('PRIVILEGE') || securityEvents.some(event => /PRIVILEGE/.test(event.type)) ? 'Observed' : 'Unavailable', detail: 'A shell or process name alone does not establish privilege escalation.' },
    { name: 'Removable media', status: countType(type => type.startsWith('USB_')) ? 'Observed' : 'Unavailable', detail: `${countType(type => type === 'USB_CONNECTED')} attachment observations. Attachment alone is not evidence of a data transfer.` },
  ];
  return {
    userId: user.id, hasTelemetry,
    // Keep the read-only 24-hour observation score distinct from the latest
    // persisted account score used by authorization and policy enforcement.
    accountRisk: { score: riskAssessment ? finiteScore(user.riskScore) : null, level: riskAssessment ? user.riskLevel ?? null : null },
    window: { from: start.toISOString(), to: at.toISOString(), hours: 24, timezone: securityTimezone(), normalStartHour: startHour, normalEndHour: endHour },
    riskScore: hasTelemetry ? strongest.riskScore : null,
    riskLevel: hasTelemetry ? riskLevel(strongest.riskScore, policy) : null,
    contributingFactors: hasTelemetry ? strongest.contributingFactors : [],
    explanation: hasTelemetry ? strongest.explanationText || 'No elevated signal was found in the available observations. Unobserved activity is not assessed.' : 'No employee-attributed interactive observation or recorded security assessment is available in the last 24 hours. Device-wide activity is not assigned as employee risk.',
    recommendation: strongest.riskScore >= policy.mfaThreshold ? 'Review the contributing evidence and the recorded policy decision.' : offHours.length ? 'Review whether the off-hours activity was expected. Continue monitoring the available signals.' : 'Continue monitoring. No elevated signal was found in the available observations.',
    source: strongest.source,
    baselineBasis: profile ? 'Learned historical access hours' : 'Configured access hours',
    trustScore, trustBasis, trustTimestamp: useStoredTrust ? user.trustUpdatedAt ?? null : trust.timestamp,
    ml: { available: Boolean(latestMl), status: latestMl ? 'RECORDED_PREDICTION' : 'AWAITING_INPUTS', probability: latestMl?.probability ?? null, scoreMeaning: 'Uncalibrated positive-class Random Forest score; not a calibrated threat probability.', timestamp: latestMl?.timestamp ?? null, reasons: latestMl?.reasons ?? [], reason: latestMl ? 'Latest recorded approved model score; original timestamp retained.' : 'No approved model prediction is recorded. Complete daily login, device, file, web and email inputs are required.' },
    coverage: { status: 'Partial', truncated, endpointEvents: endpointCount, securityEvents: securityCount, verifiedEvents: verifiedCount, deviceWideEvents: endpointCount - verifiedCount, interactiveEvents: verifiedInteractive.length, offHoursEvents: offHours.length, observedVectors: vectors.filter(vector => vector.status === 'Observed').length },
    vectors, history,
  };
}

export async function getRiskAnalysis(db, actor, id, at = new Date()) {
  const user = await scopedUser(db, actor, id);
  const from = new Date(at.getTime() - 24 * HOUR);
  const endpointScope = { companyId: actor.companyId, device: { companyId: actor.companyId, userId: user.id, user: userScope(actor) }, occurredAt: { gte: from, lte: at } };
  const activityScope = { userId: user.id, timestamp: { gte: from, lte: at } };
  const [counts, activeRows, securityRows, securityCount, trust, riskAssessment, prediction, baseline, policy] = await Promise.all([
    db.endpointEvent.groupBy({ by: ['type', 'userId'], where: endpointScope, _count: { _all: true } }),
    db.endpointEvent.findMany({ where: { ...endpointScope, type: { in: interactiveTypes }, OR: [{ userId: user.id }, { userId: null }] }, select: { userId: true, type: true, occurredAt: true }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], take: LIMIT + 1 }),
    db.activityEvent.findMany({ where: activityScope, select: { timestamp: true, type: true, riskContribution: true, metadata: true }, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: LIMIT + 1 }),
    db.activityEvent.count({ where: activityScope }),
    db.trustHistory.findFirst({ where: { userId: user.id }, orderBy: { timestamp: 'desc' }, select: { timestamp: true, trustScore: true } }),
    db.riskScore.findFirst({ where: { userId: user.id }, orderBy: { timestamp: 'desc' }, select: { id: true } }),
    // anomalyScore stores the uncalibrated positive-class score for this registered model.
    // Other models' anomaly scores must not be presented as threat probabilities.
    db.mlPrediction.findFirst({ where: { userId: user.id, modelVersion: { is: { modelName: modelMetadata.model_name } } }, orderBy: { timestamp: 'desc' }, select: { timestamp: true, anomalyScore: true, attributions: true } }),
    db.behaviorProfile.findUnique({ where: { userId: user.id } }),
    getPolicy(db, actor.companyId),
  ]);
  return analyzeRiskWindow({ user, activeEvents: activeRows.slice(0, LIMIT), counts, securityEvents: securityRows.slice(0, LIMIT), securityCount, trust, riskAssessment, prediction, baseline, policy, at, truncated: activeRows.length > LIMIT || securityRows.length > LIMIT });
}
