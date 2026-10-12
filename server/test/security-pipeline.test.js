import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deviceFixture} from './device-fixture.js';

test('baseline requires observed prior days, excludes the current day and preserves zero trust',{timeout:60000},async()=>{
 const f=await deviceFixture();let sse;
 try{
  const {learnBaseline}=await import('../services/ueba-service.js');
  const {evolveTrust}=await import('../../cyber/zero-trust/trust-engine.js');
  const {DEFAULT_POLICY}=await import('../services/policy-service.js');
  sse=(await import('../services/sse.js')).sseManager;
  assert.equal((await learnBaseline(f.prisma,f.employee.id)).available,false);
  const now=new Date();now.setUTCHours(10,0,0,0);
  await f.prisma.activityEvent.createMany({data:Array.from({length:8},(_,i)=>({eventId:randomUUID(),userId:f.employee.id,userEmail:f.employee.email,userRole:'EMPLOYEE',type:'LOGIN',timestamp:new Date(now.getTime()-i*86400000),ip:'127.0.0.1',location:'HQ',downloadSizeMB:i===0?100000:10}))});
  const b=await learnBaseline(f.prisma,f.employee.id);assert.equal(b.available,true);assert.equal(b.sampleDays,7);assert.equal(b.maxNormalDownloadMB,15);assert.equal(b.statistics.events,7);
  assert.equal(evolveTrust(0,90,DEFAULT_POLICY),0);assert.equal(evolveTrust(0,0,DEFAULT_POLICY,true),1);assert.equal(evolveTrust(0,0,DEFAULT_POLICY,false),0);
 }finally{if(sse)clearInterval(sse.heartbeatInterval);await f.close();}
});
