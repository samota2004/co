import {citySchemaReady,invalidateCitySchema,isMissingCityColumn} from './endpoint-city-schema.js';
// Minimise macOS title retention without deleting the underlying audit event.
// Bound each pass to avoid a large long-running transaction on busy installations.
export async function expireMacBrowserTitles(prisma,now=new Date()) {
  const cutoff=new Date(now.getTime()-7*86400000);
  return prisma.$executeRaw`
    UPDATE endpoint_events SET metadata = metadata - 'browserTitle'
    WHERE id IN (
      SELECT e.id FROM endpoint_events e JOIN endpoint_devices d ON d.id=e."deviceId"
      WHERE d.platform='darwin' AND e."occurredAt" < ${cutoff}
        AND e.metadata ? 'browserTitle'
      ORDER BY e."occurredAt" LIMIT 10000
    )`;
}
export function scheduleEndpointRetention(prisma) {
  let busy=false;
  const timer=setInterval(async()=>{
    if(busy)return;busy=true;
    try{await expireMacBrowserTitles(prisma);await expireCityEstimates(prisma);}catch{console.error('Endpoint retention maintenance failed; check database availability and migrations.');}
    finally{busy=false;}
  },60000);
  timer.unref();return ()=>clearInterval(timer);
}
export async function expireCityEstimates(prisma,now=new Date()) {
  if(!await citySchemaReady(prisma))return 0;
  const cutoff=new Date(now.getTime()-86400000).toISOString();
  try{return await prisma.$executeRaw`UPDATE endpoint_devices SET "ipCity" = '{"status":"expired"}'::jsonb
    WHERE "ipCity"->>'status' = 'available' AND "ipCity"->>'observedAt' < ${cutoff}`;}
  catch(error){if(!isMissingCityColumn(error))throw error;invalidateCitySchema(prisma);return 0;}
}
