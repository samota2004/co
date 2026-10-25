import fs from 'node:fs/promises';
import path from 'node:path';

const filename='authorized-stop-command.json';
const commandKeys=['action','commandId','deviceId','expiresAt','identity','issuedAt'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readState(directory){
  try{
    const state=JSON.parse(await fs.readFile(path.join(directory,filename),'utf8'));
    if(state?.version!==1||!Array.isArray(state.seen)||state.seen.some(item=>typeof item!=='string')||state.pending!==null&&(!state.pending||typeof state.pending.commandId!=='string'||typeof state.pending.expiresAt!=='string'||typeof state.pending.reportedAt!=='string'))throw new Error('Invalid persisted stop-command state');
    return state;
  }catch(error){if(error.code==='ENOENT')return{version:1,seen:[],pending:null};throw new Error('Protected stop-command state is unavailable');}
}

async function writeState(directory,state){
  const filenameTmp=path.join(directory,filename+'.tmp');
  await fs.writeFile(filenameTmp,JSON.stringify(state)+'\n',{mode:0o600});
  await fs.rename(filenameTmp,path.join(directory,filename));
}

export async function pendingStopReport(directory,now=Date.now()){
  const state=await readState(directory);
  if(state.pending&&Date.parse(state.pending.expiresAt)<=now){state.pending=null;await writeState(directory,state);return null;}
  return state.pending?{commandId:state.pending.commandId,resultCode:'STOP_ACCEPTED',reportedAt:state.pending.reportedAt}:null;
}

export async function pendingStopExpiry(directory){
  return (await readState(directory)).pending?.expiresAt||null;
}

// The command arrives only in a TLS-protected heartbeat authenticated with
// this device's enrollment credential. Its device/user binding, short expiry,
// UUID and durable replay record are checked before any service-stop request.
export async function receiveStopCommand(directory,secrets,command,now=Date.now()){
  if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).sort().join('|')!==commandKeys.join('|'))return{accepted:false,reason:'invalid_shape'};
  const issuedAt=Date.parse(command.issuedAt),expiresAt=Date.parse(command.expiresAt);
  if(command.action!=='STOP_AGENT'||!uuid.test(command.commandId)||command.deviceId!==secrets.deviceId||command.identity!==secrets.mappedIdentity||!Number.isFinite(issuedAt)||!Number.isFinite(expiresAt)||issuedAt>now+5000||expiresAt<=now||expiresAt<=issuedAt||expiresAt-issuedAt>120000)return{accepted:false,reason:'invalid_or_expired_command'};
  const state=await readState(directory);
  if(state.pending?.commandId===command.commandId)return{accepted:true,report:{commandId:command.commandId,resultCode:'STOP_ACCEPTED',reportedAt:state.pending.reportedAt}};
  if(state.seen.includes(command.commandId)||state.pending)return{accepted:false,reason:'replayed_or_conflicting_command'};
  const reportedAt=new Date(now).toISOString();
  state.seen=[...new Set([...state.seen,command.commandId])].slice(-256);
  state.pending={commandId:command.commandId,expiresAt:command.expiresAt,reportedAt};
  await writeState(directory,state);
  return{accepted:true,report:{commandId:command.commandId,resultCode:'STOP_ACCEPTED',reportedAt}};
}

export async function acknowledgeStopCommand(directory,commandId){
  const state=await readState(directory);
  if(!state.pending||state.pending.commandId!==commandId)return false;
  state.pending=null;
  await writeState(directory,state);
  return true;
}
