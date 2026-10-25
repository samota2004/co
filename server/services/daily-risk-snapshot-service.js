const DAY_MS = 86400000;
const utcDay = value => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid UTC day is required.');
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};
const endOf = start => new Date(start.getTime() + DAY_MS);
const distinct = values => [...new Set(values)];

/** Rebuilds one UTC day from persisted evidence; safe to replay after late events. */
export async function refreshDailyRiskSnapshot(db, { userId, day, finalize = false, now = new Date() }) {
  const start = utcDay(day), end = endOf(start);
  const user = await db.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true, companyId: true } });
  if (!user) return null;
  const [risks, dayTrusts, priorTrust, activities, endpoints, incidents] = await Promise.all([
    db.riskScore.findMany({ where: { userId, timestamp: { gte: start, lt: end } }, orderBy: { timestamp: 'asc' }, select: { id: true, score: true, level: true, factors: true, timestamp: true } }),
    db.trustHistory.findMany({ where: { userId, timestamp: { gte: start, lt: end } }, orderBy: { timestamp: 'asc' }, select: { trustScore: true, timestamp: true } }),
    db.trustHistory.findFirst({ where: { userId, timestamp: { lt: start } }, orderBy: { timestamp: 'desc' }, select: { trustScore: true, timestamp: true } }),
    db.activityEvent.findMany({ where: { userId, timestamp: { gte: start, lt: end } }, select: { id: true, type: true } }),
    db.endpointEvent.findMany({ where: { userId, companyId: user.companyId, occurredAt: { gte: start, lt: end } }, select: { id: true, type: true } }),
    db.incident.findMany({ where: { userId, createdAt: { gte: start, lt: end } }, select: { id: true } }),
  ]);
  const trusts=[...(priorTrust?[priorTrust]:[]),...dayTrusts];
  const observed = risks.length || dayTrusts.length || activities.length || endpoints.length || incidents.length;
  if (!observed) return null; // no synthetic zero score or activity-free assessment
  const strongest = risks.reduce((best, row) => !best || row.score >= best.score ? row : best, null);
  const latestTrust = trusts.at(-1);
  const factors = [];
  for (const risk of risks) for (const factor of Array.isArray(risk.factors) ? risk.factors : []) {
    const key = JSON.stringify(factor);
    if (!factors.some(item => JSON.stringify(item) === key)) factors.push(factor);
  }
  const sourceCounts = {
    policyRiskAssessments: risks.length,
    trustAssessments: dayTrusts.length,
    applicationActivity: activities.length,
    attributedEndpointEvents: endpoints.length,
    incidents: incidents.length,
  };
  const data = {
    companyId: user.companyId,
    riskScore: strongest?.score ?? null,
    riskLevel: strongest?.level ?? null,
    trustScore: latestTrust?.trustScore ?? null,
    trustAsOf: latestTrust?.timestamp ?? null,
    monitoringStatus: endpoints.length || activities.length ? 'OBSERVED' : 'SECURITY_EVIDENCE_ONLY',
    riskFactors: factors,
    securityEventIds: distinct([...activities.map(row => row.id), ...endpoints.map(row => row.id)]),
    riskAssessmentIds: risks.map(row => row.id),
    incidentIds: incidents.map(row => row.id),
    sourceCounts,
    ...(finalize && end <= now ? { finalized: true, finalizedAt: now } : {}),
  };
  return db.dailyRiskSnapshot.upsert({
    where: { userId_day: { userId, day: start } },
    create: { userId, day: start, ...data, finalized: Boolean(finalize && end <= now), finalizedAt: finalize && end <= now ? now : null },
    update: data,
  });
}

/** Catch-up worker is idempotent; prior days are revisited so delayed ingestion is included. */
export async function finalizeDailyRiskSnapshots(db, { now = new Date(), lookbackDays = 90 } = {}) {
  const from = utcDay(new Date(now.getTime() - lookbackDays * DAY_MS));
  const to = utcDay(now);
  const candidates = new Map();
  const add = (userId, timestamp) => {
    if (!userId) return;
    const day = utcDay(timestamp), key = `${userId}\0${day.toISOString()}`;
    candidates.set(key, { userId, day });
  };
  const collect=async(model,where,timeField)=>{let cursor;for(;;){const rows=await model.findMany({where,select:{id:true,userId:true,[timeField]:true},orderBy:{id:'asc'},take:5000,...(cursor?{cursor:{id:cursor},skip:1}:{})});for(const row of rows)add(row.userId,row[timeField]);if(rows.length<5000)break;cursor=rows.at(-1).id;}};
  await Promise.all([
    collect(db.riskScore,{timestamp:{gte:from,lt:to}},'timestamp'),
    collect(db.trustHistory,{timestamp:{gte:from,lt:to}},'timestamp'),
    collect(db.activityEvent,{timestamp:{gte:from,lt:to}},'timestamp'),
    collect(db.endpointEvent,{userId:{not:null},companyId:{not:''},occurredAt:{gte:from,lt:to}},'occurredAt'),
  ]);
  let processed = 0;
  for (const candidate of candidates.values()) {
    await refreshDailyRiskSnapshot(db, { ...candidate, finalize: candidate.day.getTime() + DAY_MS <= now.getTime(), now });
    processed++;
  }
  return { processed, truncated: false };
}

