import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const DEFAULT_USB_POLICY=Object.freeze({storage:'ALLOW',portable:'ALLOW',optical:'ALLOW'});
const createHashKey=credential=>createHash('sha256').update(credential).digest();
export function validateUsbPolicy(policy){
  if(!policy||typeof policy!=='object'||Array.isArray(policy)||Object.keys(policy).sort().join(',')!=='optical,portable,storage'||['storage','portable','optical'].some(key=>!['ALLOW','BLOCK'].includes(policy[key])))throw new Error('Invalid USB policy');
  return {storage:policy.storage,portable:policy.portable,optical:policy.optical};
}
export function usbPolicySignedPayload(command){
  return JSON.stringify({action:command.action,commandId:command.commandId,deviceId:command.deviceId,identity:command.identity,issuedAt:command.issuedAt,expiresAt:command.expiresAt,policy:validateUsbPolicy(command.policy)});
}
export function signUsbPolicyCommand(key,command){return createHmac('sha256',key).update(usbPolicySignedPayload(command)).digest('base64url');}
function validSignature(key,command){
  if(typeof command.signature!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(command.signature))return false;
  const actual=Buffer.from(command.signature,'base64url'),expected=Buffer.from(signUsbPolicyCommand(key,command),'base64url');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function classifyUsbDevice({classGuid='',pnpDeviceId=''}={}){
  if(typeof pnpDeviceId!=='string'||!pnpDeviceId.toUpperCase().startsWith('USB\\'))return 'OTHER';
  const guid=String(classGuid).replace(/[{}]/g,'').toLowerCase();
  if(guid==='4d36e967-e325-11ce-bfc1-08002be10318')return 'USB_STORAGE';
  if(guid==='eec5ad98-8080-425f-922a-dabf3de3f69a')return 'PORTABLE_DEVICE';
  if(guid==='4d36e965-e325-11ce-bfc1-08002be10318')return 'CD_DVD';
  if(guid==='4d36e96b-e325-11ce-bfc1-08002be10318')return 'KEYBOARD';
  if(guid==='4d36e96f-e325-11ce-bfc1-08002be10318')return 'MOUSE';
  if(guid==='745a17a0-74d3-11d0-b6fe-00a0c90f57da')return 'HID_PERIPHERAL';
  return 'OTHER';
}

const filename='usb-policy-command.json';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const initialState=()=>({version:1,seen:[],pending:null,activePolicy:null,activeCommandId:null});
async function readState(dir){try{const saved=JSON.parse(await fs.readFile(path.join(dir,filename),'utf8'));if(saved?.version!==1||!Array.isArray(saved.seen)||saved.seen.length>256||saved.seen.some(x=>typeof x!=='string')||saved.pending!==null&&(!saved.pending||typeof saved.pending.commandId!=='string'||!saved.pending.report))throw new Error();const state={...initialState(),...saved};if(state.activePolicy!==null)state.activePolicy=validateUsbPolicy(state.activePolicy);if(state.activeCommandId!==null&&typeof state.activeCommandId!=='string')throw new Error();return state;}catch(e){if(e.code==='ENOENT')return initialState();throw new Error('Protected USB policy state is unavailable');}}
async function writeState(dir,s){const file=path.join(dir,filename),tmp=file+'.tmp',h=await fs.open(tmp,'w',0o600);try{await h.writeFile(JSON.stringify(s)+'\n');await h.sync();}finally{await h.close();}await fs.rename(tmp,file);}
export async function persistedUsbPolicy(dir){const state=await readState(dir);return state.activePolicy?{policy:state.activePolicy,commandId:state.activeCommandId}:null;}
// Reconcile only an administrator-authenticated policy already persisted by
// receiveUsbPolicyCommand. The callback's registry result is not treated as
// independent proof of effective device access.
export async function reapplyPersistedUsbPolicy(dir,apply){
  const saved=await persistedUsbPolicy(dir);
  if(!saved)return{applied:false,status:'NO_POLICY'};
  try{
    const result=await apply(saved.policy);
    const status=['POLICY_APPLIED_UNVERIFIED','POLICY_FAILED','POLICY_UNSUPPORTED'].includes(result?.status)?result.status:'POLICY_UNVERIFIED';
    return{applied:true,status,policy:saved.policy,commandId:saved.commandId};
  }catch{return{applied:true,status:'POLICY_FAILED',policy:saved.policy,commandId:saved.commandId};}
}
export async function receiveUsbPolicyCommand(dir,secrets,command,apply,now=Date.now()){
  const keys=['action','commandId','deviceId','expiresAt','identity','issuedAt','policy','signature'];
  if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).sort().join('|')!==keys.join('|'))return{accepted:false,reason:'invalid_shape'};
  let policy;try{policy=validateUsbPolicy(command.policy);}catch{return{accepted:false,reason:'invalid_policy'};}
  const issued=Date.parse(command.issuedAt),expires=Date.parse(command.expiresAt);
  const key=createHashKey(secrets.credential);
  if(command.action!=='SET_USB_POLICY'||!uuid.test(command.commandId)||command.deviceId!==secrets.deviceId||command.identity!==secrets.mappedIdentity||!Number.isFinite(issued)||!Number.isFinite(expires)||issued>now+5000||expires<=now||expires<=issued||expires-issued>86400000)return{accepted:false,reason:'invalid_or_expired_command'};
  if(!validSignature(key,command))return{accepted:false,reason:'invalid_signature'};
  const state=await readState(dir);
  if(state.pending?.commandId===command.commandId)return{accepted:true,report:state.pending.report};
  if(state.seen.includes(command.commandId))return{accepted:false,reason:'replayed_command'};
  let result;
  try{result=await apply(policy);}catch{result={status:'POLICY_FAILED',detail:'Native policy application failed'};}
  const status=['POLICY_APPLIED_UNVERIFIED','POLICY_FAILED','POLICY_UNSUPPORTED'].includes(result?.status)?result.status:'POLICY_UNVERIFIED';
  const report={commandId:command.commandId,resultCode:status,reportedAt:new Date(now).toISOString(),policy};
  state.seen=[...state.seen,command.commandId].slice(-256);state.activePolicy=policy;state.activeCommandId=command.commandId;state.pending={commandId:command.commandId,report};
  await writeState(dir,state);
  return{accepted:true,report};
}
export async function acknowledgeUsbPolicyCommand(dir,commandId){const state=await readState(dir);if(!state.pending||state.pending.commandId!==commandId)return false;state.pending=null;await writeState(dir,state);return true;}
