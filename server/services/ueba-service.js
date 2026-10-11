import {localHour,securityTimezone} from './time-context.js';
export async function learnBaseline(db,userId,at=new Date()){
  const end=new Date(at);end.setUTCHours(0,0,0,0);const start=new Date(end.getTime()-30*86400000);
  const events=await db.activityEvent.findMany({where:{userId,timestamp:{gte:start,lt:end}},orderBy:{timestamp:'asc'},take:10000});
  const days=new Map(),hours=[],locations=new Set();
  for(const e of events){const day=e.timestamp.toISOString().slice(0,10);days.set(day,(days.get(day)||0)+(e.downloadSizeMB||0));if(['LOGIN_SUCCESS','LOGIN'].includes(e.type))hours.push(localHour(e.timestamp));if(e.location&&e.location!=='Unknown')locations.add(e.location);}
  if(events.length===10000)return{available:false,sampleDays:days.size,reason:'History exceeds the bounded learning limit. An offline baseline rebuild with complete source coverage is required.'};
  if(days.size<7)return{available:false,sampleDays:days.size,reason:'At least seven prior observed days are required. Configured cold-start context rules remain available.'};
  const volumes=[...days.values()].sort((a,b)=>a-b),quantile=(a,q)=>a[Math.floor((a.length-1)*q)];hours.sort((a,b)=>a-b);
  const avg=volumes.reduce((a,b)=>a+b,0)/volumes.length;
  const data={sampleDays:days.size,trainedThrough:end,avgDailyDownloadsMB:avg,maxNormalDownloadMB:Math.max(1,quantile(volumes,.95)*1.5),typicalLocations:[...locations].slice(0,100),normalStartHour:hours.length?quantile(hours,.05):9,normalEndHour:hours.length?Math.min(24,quantile(hours,.95)+1):18,statistics:{windowStart:start.toISOString(),windowEnd:end.toISOString(),events:events.length,observedDays:days.size,dailyWindowTimezone:'UTC',loginHourTimezone:securityTimezone(),synthetic:events.some(e=>e.metadata?.synthetic||String(e.metadata?.source||'').startsWith('synthetic')),method:'Historical daily totals and login-hour quantiles; current day excluded'}};
  const baseline=await db.behaviorProfile.upsert({where:{userId},create:{userId,...data},update:data});return{available:true,...baseline};
}
