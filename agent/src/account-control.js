import path from 'node:path';
import fs from 'node:fs/promises';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import { nativeInput } from './native.js';
import { applyUnixAccountControl } from './unix-account-control.js';

const commandFile='account-control-commands.json';
const commandKey=credential=>createHash('sha256').update(credential).digest();
function signedPayload(c){return JSON.stringify({action:c.action,commandId:c.commandId,deviceId:c.deviceId,identity:c.identity,issuedAt:c.issuedAt,expiresAt:c.expiresAt});}
export function signAccountControlCommand(key,c){return createHmac('sha256',key).update(signedPayload(c)).digest('base64url');}
function verifySignature(key,c){if(typeof c.signature!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(c.signature))return false;const a=Buffer.from(c.signature,'base64url'),b=Buffer.from(signAccountControlCommand(key,c),'base64url');return a.length===b.length&&timingSafeEqual(a,b);}
async function commandState(dir){try{const s=JSON.parse(await fs.readFile(path.join(dir,commandFile),'utf8'));if(s?.version!==1||!Array.isArray(s.seen)||s.seen.length>256||s.seen.some(x=>!x||typeof x.commandId!=='string'||typeof x.report!=='string'))throw Error();return s;}catch(e){if(e.code==='ENOENT')return{version:1,seen:[]};throw new Error('Protected account-control replay state is unavailable');}}
async function saveCommandState(dir,state){const file=path.join(dir,commandFile),tmp=file+'.tmp',h=await fs.open(tmp,'w',0o600);try{await h.writeFile(JSON.stringify(state)+'\n');await h.sync();}finally{await h.close();}await fs.rename(tmp,file);}

// Only fresh authenticated heartbeat responses drive OS changes. Never replay
// cached collector settings, queued events, or agent-provided employee IDs.
export async function reconcileAccountControl(local, secrets, command, run = nativeInput, platform = process.platform) {
  if(local.installMode==='user') return 'unsupported: user mode cannot change OS accounts';
  const windows = platform === 'win32';
  const policy = windows ? local.windowsAccountControl : local.unixAccountControl;
  if (policy?.enabled !== true) return 'disabled: local OS account control not approved';
  if (!['win32','linux','darwin'].includes(platform)) return 'refused: unsupported OS';
  const sid = windows ? /^S-1-5-21-\d+-\d+-\d+-\d+$/ : /^uid:\d+$/;
  const employee = windows ? policy.employeeSid : policy.employeeIdentity;
  const recovery = windows ? policy.recoveryAdminSid : policy.recoveryAdminIdentity;
  if (!sid.test(employee || '') || !sid.test(recovery || '') ||
      employee === recovery || employee !== secrets.mappedIdentity ||
      policy.recoveryLoginVerified !== true) return 'refused: verify employee OS identity and separate recovery administrator';
  if (!command || Object.keys(command).sort().join('|')!=='action|commandId|deviceId|expiresAt|identity|issuedAt|signature' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.commandId||'') ||
      command.deviceId !== secrets.deviceId || command.identity !== secrets.mappedIdentity ||
      !['ALLOW','BLOCK','HOLD'].includes(command.action) ||
      !Number.isFinite(Date.parse(command.issuedAt)) || !Number.isFinite(Date.parse(command.expiresAt)) ||
      Date.parse(command.issuedAt)>Date.now()+5000 || Date.parse(command.expiresAt)<=Date.now() ||
      Date.parse(command.expiresAt)<=Date.parse(command.issuedAt) || Date.parse(command.expiresAt)-Date.parse(command.issuedAt)>120000 ||
      !verifySignature(commandKey(secrets.credential),command)) {
    return 'refused: missing, stale or mismatched account instruction';
  }
  if (command.action === 'HOLD') return 'unchanged: account state requires administrator review';
  let state;try{state=await commandState(local.dataDirectory);}catch{return 'error: account-control replay protection unavailable';}
  const previous=state.seen.find(x=>x.commandId===command.commandId);
  if(previous&&previous.report!=='LOGOFF_PENDING')return `reported: ${previous.report}`;
  try {
    const result = windows ? JSON.parse(await run('windows-account-control.ps1', {
      action: command.action, employeeSid: policy.employeeSid, recoveryAdminSid: policy.recoveryAdminSid,
      deviceId: secrets.deviceId, stateDirectory: path.resolve(local.dataDirectory)
    })) : await applyUnixAccountControl({action:command.action,employeeIdentity:employee,recoveryAdminIdentity:recovery,
      deviceId:secrets.deviceId,stateDirectory:path.resolve(local.dataDirectory)}, {platform});
    const codes = new Set(['ALLOWED','BLOCKED','LOGOFF_PENDING','EXTERNALLY_DISABLED','RECOVERY_REQUIRED',
      'UNSAFE_ACCOUNT','UNSAFE_RECOVERY','UNSUPPORTED_MACHINE','UNSAFE_STORAGE','ACCESS_DENIED','NATIVE_ERROR']);
    if(!codes.has(result.code))return 'error: invalid native account-control response';
    state.seen=[...state.seen.filter(item=>item.commandId!==command.commandId),{commandId:command.commandId,report:result.code}].slice(-256);
    try{await saveCommandState(local.dataDirectory,state);}catch{return 'error: account-control result could not be durably recorded';}
    return `reported: ${result.code}`;
  } catch { return 'error: account-control helper failed; recovery administrator may be required'; }
}
