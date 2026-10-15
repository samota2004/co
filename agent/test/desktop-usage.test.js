import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {DesktopUsage,usageEligible,knownLock} from '../src/desktop-usage.js';
import {desktopControls,nativeDesktopControl} from '../src/desktop-control.js';
import {desktopSampleStatus} from '../src/health.js';
import {startIpc,sendSample} from '../src/ipc.js';
const options={identity:'uid:502',activeApplication:true,sessions:true,browserTitles:false};
const sample=(extra={})=>({identity:options.identity,pid:42,name:'TextEdit',appId:'com.apple.TextEdit',sessionId:'desktop:502',identitySource:'macos-bundle',idleMilliseconds:10,
  sessionState:'unknown',consoleActive:true,foregroundOwned:true,activityEligible:true,controlFresh:true,controlActiveApplication:true,...extra});
function fixture() {
  let now=10000;const events=[],usage=new DesktopUsage(async(type,metadata)=>events.push({type,metadata}),{now:()=>now});
  return {events,usage,tick:async(extra={},ms=2000)=>{now+=ms;await usage.sample(sample(extra),options);},advance:ms=>now+=ms};
}
test('unknown lock never means unlocked; only verified own active foreground activity can accrue usage',async()=>{
  const f=fixture();await f.tick();await f.tick();await f.usage.finish(options);
  assert.equal(knownLock(sample()),undefined);assert.equal(f.events.some(e=>e.type.startsWith('SESSION_')),false);
  assert.equal(f.events.find(e=>e.type==='APPLICATION_USAGE').metadata.durationSeconds,2);
  for(const extra of [{consoleActive:false},{foregroundOwned:false},{activityEligible:false},{controlFresh:false},{controlActiveApplication:false},{idleStateAvailable:false},{pid:0},{name:''},{locked:true},{sessionState:'locked'},{idleMilliseconds:60000}])assert.equal(usageEligible(sample(extra)),false);
  assert.equal(knownLock(sample({locked:true})),true);
  assert.equal(usageEligible({pid:42,name:'Legacy helper',idleMilliseconds:0,sessionStatus:'lock-state-unavailable'}),false);
});
test('app switches flush the prior app once and start the next app at zero duration',async()=>{
  const f=fixture();await f.tick();await f.tick();await f.tick({pid:43,name:'Preview',appId:'com.apple.Preview'});await f.tick({pid:43,name:'Preview',appId:'com.apple.Preview'});
  await f.usage.finish(options);
  assert.deepEqual(f.events.filter(e=>e.type==='APPLICATION_USAGE').map(e=>[e.metadata.name,e.metadata.durationSeconds]),[['TextEdit',4],['Preview',2]]);
  assert.equal(f.events.filter(e=>e.type==='APPLICATION_FOREGROUND').length,2);
});
test('idle/locked/empty samples flush already observed duration and never transfer it into a later app',async()=>{
  for(const boundary of [{idleMilliseconds:60000},{sessionState:'locked',locked:true},{pid:0,name:'',activityEligible:false},{consoleActive:false}]) {
    const f=fixture();await f.tick();await f.tick();await f.tick(boundary);
    await f.tick({pid:43,name:'Preview',appId:'com.apple.Preview'},3000);await f.tick({pid:43,name:'Preview',appId:'com.apple.Preview'});await f.usage.finish(options);
    assert.deepEqual(f.events.filter(e=>e.type==='APPLICATION_USAGE').map(e=>e.metadata.durationSeconds),[2,2]);
  }
});
test('threshold, stale-helper gaps and shutdown preserve observed time without inventing elapsed time',async()=>{
  const f=fixture();for(let i=0;i<17;i++)await f.tick();
  assert.equal(f.events.filter(e=>e.type==='APPLICATION_USAGE')[0].metadata.durationSeconds,30);
  f.advance(60000);await f.usage.expire(options);
  assert.deepEqual(f.events.filter(e=>e.type==='APPLICATION_USAGE').map(e=>e.metadata.durationSeconds),[30,2]);
  await f.tick();await f.tick();await f.usage.finish(options);await f.usage.finish(options);
  assert.deepEqual(f.events.filter(e=>e.type==='APPLICATION_USAGE').map(e=>e.metadata.durationSeconds),[30,2,2]);
});
test('unknown samples do not fabricate unlock; confirmed lock-to-unlock transition survives unknown samples',async()=>{
  const f=fixture();await f.tick({sessionState:'locked',locked:true});await f.tick();await f.tick({sessionState:'unlocked',locked:false});await f.tick({sessionState:'unlocked',locked:false});
  assert.deepEqual(f.events.filter(e=>e.type.startsWith('SESSION_')).map(e=>e.type),['SESSION_STATE','SESSION_UNLOCK']);
});
test('reset/pause and disabled application collection cannot accumulate prior durations',async()=>{
  const f=fixture();await f.tick();await f.tick();await f.usage.reset();await f.tick();await f.usage.finish(options);
  assert.equal(f.events.some(e=>e.type==='APPLICATION_USAGE'),false);
  await f.usage.sample(sample(),{...options,activeApplication:false});await f.usage.sample(sample(),{...options,activeApplication:false});await f.usage.finish(options);
  assert.equal(f.events.some(e=>e.type==='APPLICATION_USAGE'),false);
});
test('health identifies control, owner and foreground failures instead of masking everything with unknown-lock warning',()=>{
  assert.match(desktopSampleStatus(sample()),/own foreground verified; usage eligible/);
  assert.match(desktopSampleStatus(sample({controlActiveApplication:false})),/activeApplication=false/);
  assert.match(desktopSampleStatus(sample({controlFresh:false})),/controls missing or stale/);
  assert.match(desktopSampleStatus(sample({idleStateAvailable:false})),/idle state unavailable/);
  assert.match(desktopSampleStatus(sample({name:'',activityEligible:false,foregroundStatus:'owner-query-failed'})),/UID query failed/);
  assert.match(desktopSampleStatus(sample({name:'',activityEligible:false,foregroundStatus:'frontmost-unavailable'})),/AppKit returned no active/);
  assert.match(desktopSampleStatus(sample({locked:true})),/session locked/);
});
test('authenticated desktop-control bootstrap delivers activeApplication=true before any foreground sample',async t=>{
  const key=randomBytes(32).toString('base64');let config={activeApplication:true,sessions:true,paused:false,browserTitles:false},observations=0;
  const server=await startIpc({helperKey:key,mappedIdentity:options.identity},s=>{if(s.kind!=='desktop-control')observations++;},{port:0,controls:()=>desktopControls(config)});
  t.after(()=>server.close());const grant={key,identity:options.identity},port=server.address().port;
  const reply=await sendSample(grant,{identity:options.identity,kind:'desktop-control'},{port});
  assert.equal(nativeDesktopControl(reply).activeApplication,true);assert.equal(observations,0);
  config={...config,paused:true};assert.equal(nativeDesktopControl(await sendSample(grant,{identity:options.identity,kind:'desktop-control'},{port})).activeApplication,false);
  assert.equal(desktopControls({...config,paused:false},{revoked:true}).activeApplication,false);
});
test('legacy Windows/Linux boolean lock samples preserve valid usage and strict event metadata',async()=>{
  const f=fixture();const s={identity:'uid:502',pid:42,name:'legacy-app',sessionId:'1',locked:false,idleMilliseconds:1};
  await f.usage.sample(s,options);f.advance(2000);await f.usage.sample(s,options);await f.usage.finish(options);
  const usage=f.events.find(e=>e.type==='APPLICATION_USAGE');assert.equal(usage.metadata.durationSeconds,2);
  for(const key of ['sessionState','activityEligible','controlFresh','foregroundOwned'])assert.equal(key in usage.metadata,false);
});
