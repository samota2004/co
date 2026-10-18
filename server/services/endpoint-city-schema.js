// Core endpoint queries must remain valid against the pre-city database. Do not
// let Prisma's default all-column selection turn optional city metadata into a
// dependency of enrollment, heartbeats or the existing device dashboard.
export const coreDeviceSelect=Object.freeze({
  id:true,companyId:true,userId:true,name:true,platform:true,mappedIdentity:true,
  credentialHash:true,enrollmentHash:true,enrollmentExpiresAt:true,enrolledAt:true,
  revokedAt:true,lastSeen:true,agentVersion:true,health:true,config:true,createdAt:true
});
export const cityDeviceSelect=Object.freeze({ipCityEnabled:true,ipCityGeneration:true,ipCity:true});
const readiness=new WeakMap();
export function invalidateCitySchema(prisma) {readiness.set(prisma,{ready:false,until:Date.now()+5000});}
export function isMissingCityColumn(error) {
  const field=String(error?.meta?.column||error?.meta?.message||'');
  return (error?.code==='P2022'||(error?.code==='P2010'&&error?.meta?.code==='42703'))&&/\bipCity(?:Enabled|Generation)?\b/.test(field);
}
export async function citySchemaReady(prisma) {
  // Test adapters for the original contract may not implement raw SQL.
  if(typeof prisma.$queryRaw!=='function')return false;
  const cached=readiness.get(prisma);if(cached&&cached.until>Date.now())return cached.ready;
  const rows=await prisma.$queryRaw`SELECT count(*)::int AS present
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='endpoint_devices'
      AND column_name IN ('ipCityEnabled','ipCityGeneration','ipCity')`;
  const ready=rows[0]?.present===3;
  readiness.set(prisma,{ready,until:Date.now()+(ready?30000:5000)});return ready;
}
export async function withCitySchema(prisma,operation) {
  const ready=await citySchemaReady(prisma);
  try{return await operation(ready);}
  catch(error) {
    // Retry outside the failed transaction: PostgreSQL aborts a transaction on
    // undefined-column errors. Core failures must still propagate normally.
    if(!ready||!isMissingCityColumn(error))throw error;
    invalidateCitySchema(prisma);return operation(false);
  }
}
