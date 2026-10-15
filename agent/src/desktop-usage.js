import {desktopAppChanged,desktopAppMetadata} from './normalizer.js';

export function usageEligible(sample) {
  if(!sample || sample.locked===true || sample.sessionState==='locked' || sample.consoleActive===false || sample.activityEligible===false || sample.controlFresh===false || sample.controlActiveApplication===false || sample.idleStateAvailable===false)return false;
  if((sample.sessionState==='unknown' || sample.sessionStatus==='lock-state-unavailable') && !(sample.consoleActive===true && sample.foregroundOwned===true && sample.activityEligible===true))return false;
  return sample.pid>0 && Boolean(sample.name) && Number.isFinite(sample.idleMilliseconds) && sample.idleMilliseconds<60000;
}
export function knownLock(sample) {
  if(sample.sessionState==='locked' || sample.locked===true)return true;
  if(sample.sessionState==='unknown' || sample.sessionStatus==='lock-state-unavailable')return undefined;
  if(sample.sessionState==='unlocked' || sample.locked===false)return false;
  return undefined;
}
export class DesktopUsage {
  constructor(emit,{now=Date.now,onUsage=()=>{},maxGapMs=5000,flushSeconds=30}={}) {
    Object.assign(this,{emit,now,onUsage,maxGapMs,flushSeconds});this.states=new Map();this.lastLocks=new Map();this.serial=Promise.resolve();
  }
  run(fn) {const pending=this.serial.then(fn);this.serial=pending.catch(()=>{});return pending;}
  async flush(state,{identity,browserTitles}) {
    if(!(state?.duration>0) || !state.name)return;
    const durationSeconds=Math.min(120,Math.round(state.duration*100)/100);
    if(durationSeconds>0) {
      await this.emit('APPLICATION_USAGE',{identity,sessionId:state.sessionId,pid:state.pid,name:state.name,durationSeconds,
        ...desktopAppMetadata(state),...(browserTitles && state.browserTitle?{browserTitle:state.browserTitle}:{})});
      this.onUsage({at:new Date(this.now()).toISOString(),pid:state.pid,durationSeconds});
    }
    state.duration=0;
  }
  sample(sample,options) {return this.run(()=>this.observe(sample,options));}
  async observe(sample,{identity,activeApplication,sessions,browserTitles}) {
    const now=this.now(),prior=this.states.get(sample.sessionId),options={identity,browserTitles};
    if(!prior && this.states.size>=100)throw new Error('Session capacity reached');
    const active=activeApplication && usageEligible(sample),wasActive=activeApplication && usageEligible(prior);
    const gap=prior?now-prior.time:0,continuous=gap>=0 && gap<=this.maxGapMs;
    // A switch closes the interval for the previously observed app. Locked,
    // idle, unknown/ineligible and stale samples never extend that interval.
    if(prior && wasActive && active && continuous)prior.duration+=gap/1000;
    if(prior && (!active || !wasActive || !continuous || desktopAppChanged(prior,sample) || prior.duration>=this.flushSeconds))await this.flush(prior,options);
    if(active && (!wasActive || !continuous || prior.pid!==sample.pid || prior.name!==sample.name || prior.appId!==sample.appId)) {
      await this.emit('APPLICATION_FOREGROUND',{identity,sessionId:sample.sessionId,pid:sample.pid,name:sample.name,...desktopAppMetadata(sample)});
    }
    const lock=knownLock(sample),last=this.lastLocks.get(sample.sessionId);
    if(sessions && lock!==undefined) {
      if(last===undefined)await this.emit('SESSION_STATE',{identity,sessionId:sample.sessionId,state:lock?'locked':'unlocked'});
      else if(last!==lock)await this.emit(lock?'SESSION_LOCK':'SESSION_UNLOCK',{identity,sessionId:sample.sessionId,state:lock?'locked':'unlocked'});
      this.lastLocks.set(sample.sessionId,lock);
    }
    this.states.set(sample.sessionId,{...sample,time:now,duration:active && prior && wasActive && continuous && !desktopAppChanged(prior,sample)?prior.duration:0});
  }
  expire(options) {return this.run(()=>this.expireStates(options));}
  async expireStates(options) {
    for(const [session,state] of this.states)if(this.now()-state.time>this.maxGapMs) {await this.flush(state,options);this.states.delete(session);}
  }
  finish(options) {return this.run(async()=>{for(const state of this.states.values())await this.flush(state,options);this.states.clear();this.lastLocks.clear();});}
  reset() {return this.run(()=>{this.states.clear();this.lastLocks.clear();});}
}
