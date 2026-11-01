import fs from 'node:fs/promises';
import path from 'node:path';

const filename='authorized-stop-command.json';
const commandKeys=['action','commandId','deviceId','expiresAt','identity','issuedAt'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions=new Set(['STOP_AGENT','START_AGENT']);
const initialState=()=>({version:2,seen:[],pending:null,adminStopped:false,lastTransitionCommandId:null});

async function readState(directory){
  try{
    const state=JSON.parse(await fs.readFile(path.join(directory,filename),'utf8'));
    if(state?.version===1 && Array.isArray(state.seen) && (state.pending===null || state.pending&&typeof state.pending.commandId==='string')) {
      return {...initialState(),seen:state.seen,pending:state.pending?{...state.pending,action:'STOP_AGENT'}:null};
    }
    if(state?.version!==2||!Array.isArray(state.seen)||state.seen.length>256||state.seen.some(item=>typeof item!=='string')||
       state.pending!==null&&(!state.pending||typeof state.pending.commandId!=='string'||!actions.has(state.pending.action)||typeof state.pending.expiresAt!=='string'||typeof state.pending.reportedAt!=='string')||
       typeof state.adminStopped!=='boolean'||state.lastTransitionCommandId!==null&&typeof state.lastTransitionCommandId!=='string') throw new Error('Invalid persisted lifecycle state');
    return state;
  }catch(error){if(error.code==='ENOENT')return initialState();throw new Error('Protected administrative lifecycle state is unavailable');}
}

async function writeState(directory,state){
  const target=path.join(directory,filename),temporary=target+'.tmp';
  const pending=await fs.open(temporary,'w',0o600);
  try{await pending.writeFile(JSON.stringify(state)+'\n');await pending.sync();}finally{await pending.close();}
  await fs.rename(temporary,target);
  const committed=await fs.open(target,'r+');
  try{await committed.sync();}finally{await committed.close();}
  if(process.platform!=='win32'){
    const parent=await fs.open(directory,'r');
    try{await parent.sync();}finally{await parent.close();}
  }
}

export async function administrativeStopState(directory){return (await readState(directory)).adminStopped;}

export async function pendingAdminCommandExpiry(directory){return (await readState(directory)).pending?.expiresAt||null;}

export async function pendingAdminCommandReport(directory,now=Date.now()){
  const state=await readState(directory);
  if(state.pending&&Date.parse(state.pending.expiresAt)<=now){state.pending=null;await writeState(directory,state);return null;}
  if(!state.pending)return null;
  return {commandId:state.pending.commandId,resultCode:state.pending.action==='STOP_AGENT'?'STOP_ACCEPTED':'START_ACCEPTED',reportedAt:state.pending.reportedAt};
}

// Compatibility for existing tests/callers that only understand stop commands.
export async function pendingStopExpiry(directory){return pendingAdminCommandExpiry(directory);}
export async function pendingStopReport(directory,now=Date.now()){
  const state=await readState(directory);
  return state.pending?.action==='STOP_AGENT'?pendingAdminCommandReport(directory,now):null;
}

// Commands are delivered only in a TLS heartbeat authenticated with the
// enrolled device credential. The persistent state file inherits the protected
// ProgramData ACL (SYSTEM and Administrators only) on Windows.
export async function receiveAdminCommand(directory,secrets,command,now=Date.now()){
  if(!command||typeof command!=='object'||Array.isArray(command)||Object.keys(command).sort().join('|')!==commandKeys.join('|'))return{accepted:false,reason:'invalid_shape'};
  const issuedAt=Date.parse(command.issuedAt),expiresAt=Date.parse(command.expiresAt);
  if(!actions.has(command.action)||!uuid.test(command.commandId)||command.deviceId!==secrets.deviceId||command.identity!==secrets.mappedIdentity||!Number.isFinite(issuedAt)||!Number.isFinite(expiresAt)||issuedAt>now+5000||expiresAt<=now||expiresAt<=issuedAt||expiresAt-issuedAt>120000)return{accepted:false,reason:'invalid_or_expired_command'};
  const state=await readState(directory);
  if(state.pending?.commandId===command.commandId)return{accepted:true,adminStopped:state.adminStopped,report:{commandId:command.commandId,resultCode:command.action==='STOP_AGENT'?'STOP_ACCEPTED':'START_ACCEPTED',reportedAt:state.pending.reportedAt}};
  if(state.seen.includes(command.commandId))return{accepted:false,reason:'replayed_or_conflicting_command'};
  const reportedAt=new Date(now).toISOString();
  state.seen=[...new Set([...state.seen,command.commandId])].slice(-256);
  state.pending={commandId:command.commandId,action:command.action,expiresAt:command.expiresAt,reportedAt};
  state.adminStopped=command.action==='STOP_AGENT';
  state.lastTransitionCommandId=command.commandId;
  await writeState(directory,state);
  return{accepted:true,adminStopped:state.adminStopped,report:{commandId:command.commandId,resultCode:command.action==='STOP_AGENT'?'STOP_ACCEPTED':'START_ACCEPTED',reportedAt}};
}

export async function acknowledgeAdminCommand(directory,commandId){
  const state=await readState(directory);
  if(!state.pending||state.pending.commandId!==commandId)return{accepted:false,adminStopped:state.adminStopped};
  state.pending=null;
  await writeState(directory,state);
  return{accepted:true,adminStopped:state.adminStopped};
}

export async function receiveStopCommand(directory,secrets,command,now=Date.now()){
  if(command?.action!=='STOP_AGENT')return{accepted:false,reason:'unsupported_action'};
  return receiveAdminCommand(directory,secrets,command,now);
}

export async function acknowledgeStopCommand(directory,commandId){
  const result=await acknowledgeAdminCommand(directory,commandId);
  return result.accepted;
}
