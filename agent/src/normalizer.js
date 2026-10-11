import { randomUUID } from 'node:crypto';
import { VERSION, validateEvent } from '../shared/contract.js';
export function desktopAppMetadata(sample) {
  const fields={};
  for(const [key,max] of Object.entries({appId:512,appName:256,hostName:256})) {
    if(typeof sample[key]==='string') {
      const value=sample[key].replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);
      if(value)fields[key]=value;
    }
  }
  if(['process','hosted-process','windows-app-id','unresolved-host'].includes(sample.identitySource))fields.identitySource=sample.identitySource;
  return fields;
}
export function desktopAppChanged(prior,current) {
  return prior.pid!==current.pid || prior.name!==current.name || prior.appId!==current.appId || prior.browserTitle!==current.browserTitle;
}
export function foregroundObserved(prior,current,now) {
  const active=s=>s && s.pid>0 && Boolean(s.name) && s.locked!==true && s.idleMilliseconds<60000;
  return active(current) && (!active(prior) || now-prior.time>5000 || prior.pid!==current.pid || prior.name!==current.name || prior.appId!==current.appId);
}
export function normalize(deviceId, type, metadata, occurredAt = new Date().toISOString()) {
  return validateEvent({ version: VERSION, eventId: randomUUID(), deviceId, occurredAt, type,
    metadata: Object.fromEntries(Object.entries(metadata).filter(([,v]) => v !== undefined && v !== null)) });
}
