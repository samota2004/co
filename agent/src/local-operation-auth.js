import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,createHmac,timingSafeEqual,randomUUID} from 'node:crypto';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const LOCAL_OPERATION_ACTIONS=Object.freeze(['SERVICE_STOP','AGENT_UNINSTALL']);
export const localOperationKey=credential=>createHash('sha256').update(credential).digest();
export const localOperationPayload=grant=>JSON.stringify({version:grant.version,requestId:grant.requestId,deviceId:grant.deviceId,identity:grant.identity,action:grant.action,issuedAt:grant.issuedAt,expiresAt:grant.expiresAt,nonce:grant.nonce});
export const signLocalOperationGrant=(key,grant)=>createHmac('sha256',key).update(localOperationPayload(grant)).digest('base64url');
export function verifyLocalOperationGrant(key,grant,{deviceId,identity,action,now=Date.now()}={}){
  if(!grant||typeof grant!=='object'||Array.isArray(grant)||Object.keys(grant).sort().join('|')!=='action|deviceId|expiresAt|identity|issuedAt|nonce|requestId|signature|version')return false;
  const issued=Date.parse(grant.issuedAt),expires=Date.parse(grant.expiresAt),actual=Buffer.from(grant.signature||'','base64url'),expected=Buffer.from(signLocalOperationGrant(key,grant),'base64url');
  return grant.version===1&&LOCAL_OPERATION_ACTIONS.includes(grant.action)&&(!action||grant.action===action)&&uuid.test(grant.requestId)&&uuid.test(grant.deviceId)&&grant.deviceId===deviceId&&grant.identity===identity&&uuid.test(grant.nonce)&&Number.isFinite(issued)&&Number.isFinite(expires)&&issued<=now+5000&&expires>now&&expires>issued&&expires-issued<=120000&&actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function persistVerifiedLocalOperationGrant(directory,key,grant,secrets,now=Date.now()){
  if(!verifyLocalOperationGrant(key,grant,{deviceId:secrets.deviceId,identity:secrets.mappedIdentity,now}))return false;
  const target=path.join(directory,'local-operation-grant.json');
  try{
    const existing=JSON.parse(await fs.readFile(target,'utf8'));
    if(existing?.nonce===grant.nonce&&verifyLocalOperationGrant(key,existing,{deviceId:secrets.deviceId,identity:secrets.mappedIdentity,now}))return true;
    // A valid live grant must never be displaced. Expired, malformed or
    // otherwise invalid leftovers from a prior operation may be replaced by
    // this newly server-signed grant so they cannot permanently block control.
    if(verifyLocalOperationGrant(key,existing,{deviceId:secrets.deviceId,identity:secrets.mappedIdentity,now}))return false;
  }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))return false;}
  const temporary=target+'.'+randomUUID()+'.tmp',handle=await fs.open(temporary,'wx',0o600);
  try{await handle.writeFile(JSON.stringify(grant)+'\n');await handle.sync();}finally{await handle.close();}
  try{await fs.rename(temporary,target);return true;}catch(error){await fs.rm(temporary,{force:true});if(error.code==='EEXIST'){const existing=JSON.parse(await fs.readFile(target,'utf8'));return existing?.nonce===grant.nonce;}throw error;}
}
export async function clearLocalOperationGrant(directory){await fs.rm(path.join(directory,'local-operation-grant.json'),{force:true});}
export const createLocalOperationRequestId=()=>randomUUID();
