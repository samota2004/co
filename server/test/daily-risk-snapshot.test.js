import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';
import {refreshDailyRiskSnapshot,finalizeDailyRiskSnapshots} from '../services/daily-risk-snapshot-service.js';

test('daily risk snapshots are UTC, idempotent, preserve unassessed fields and absorb delayed evidence',{timeout:90000},async()=>{
 const f=await deviceFixture();
 try{
  const day=new Date('2026-10-20T00:00:00.000Z'),eventTime=new Date('2026-10-20T23:59:00.000Z');
  const risk=await f.prisma.riskScore.create({data:{userId:f.employee.id,score:42,level:'MEDIUM',factors:[{factor:'Synthetic fixture policy evidence',category:'TEST'}],timestamp:eventTime}});
  await f.prisma.trustHistory.create({data:{userId:f.employee.id,trustScore:71,riskScore:42,reason:'Synthetic fixture',timestamp:eventTime}});
  const first=await refreshDailyRiskSnapshot(f.prisma,{userId:f.employee.id,day:new Date('2026-10-20T19:00:00-04:00'),finalize:true,now:new Date('2026-10-22T00:00:00Z')});
  assert.equal(first.day.toISOString(),'2026-10-20T00:00:00.000Z');assert.equal(first.riskScore,42);assert.equal(first.trustScore,71);assert.equal(first.monitoringStatus,'SECURITY_EVIDENCE_ONLY');assert.equal(first.finalized,true);
  const duplicate=await refreshDailyRiskSnapshot(f.prisma,{userId:f.employee.id,day,finalize:false});assert.equal(duplicate.id,first.id);assert.equal(await f.prisma.dailyRiskSnapshot.count({where:{userId:f.employee.id,day}}),1);
  const lateRisk=await f.prisma.riskScore.create({data:{userId:f.employee.id,score:63,level:'HIGH',factors:[{factor:'Delayed synthetic test evidence',category:'TEST'}],timestamp:new Date('2026-10-20T21:00:00Z')}});
  const refreshed=await refreshDailyRiskSnapshot(f.prisma,{userId:f.employee.id,day,finalize:true,now:new Date('2026-10-22T00:00:00Z')});assert.equal(refreshed.id,first.id);assert.equal(refreshed.riskScore,63);assert.equal(refreshed.riskFactors.length,2);assert.ok(refreshed.riskAssessmentIds.includes(risk.id)&&refreshed.riskAssessmentIds.includes(lateRisk.id));
  assert.equal(await refreshDailyRiskSnapshot(f.prisma,{userId:f.employee2.id,day}),null,'a date with no assessable activity does not create a fake zero snapshot');
  const catchup=await finalizeDailyRiskSnapshots(f.prisma,{now:new Date('2026-10-22T00:00:00Z')});assert.ok(catchup.processed>=1);
 }finally{await f.close();}
});
