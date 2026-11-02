import { readConfig } from './config.js';
import { enroll } from './enrollment.js';
import { runService } from './service.js';
import { runDesktopHelper } from './desktop-helper.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CredentialStore} from './credential-store.js';
import {Transport} from './uploader.js';
import {requestLocalOperationFromDesktop} from './local-operation-client.js';
import {localOperationKey,verifyLocalOperationGrant} from './local-operation-auth.js';
const [command,configFile,...args]=process.argv.slice(2);
async function consumeLocalGrant(config,action){
  const secrets=await new CredentialStore(config.dataDirectory).load(),grantPath=path.join(config.dataDirectory,'local-operation-grant.json');
  const grant=JSON.parse(await fs.readFile(grantPath,'utf8'));
  if(!verifyLocalOperationGrant(localOperationKey(secrets.credential),grant,{deviceId:secrets.deviceId,identity:secrets.mappedIdentity,action}))throw new Error('No valid, unexpired Main Admin authorization grant exists for this device and action.');
  const statePath=path.join(config.dataDirectory,'local-operation-consumed.json');let state={version:1,nonces:[]};
  try{state=JSON.parse(await fs.readFile(statePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Protected local authorization history is unavailable.');}
  if(state.version!==1||!Array.isArray(state.nonces)||state.nonces.length>256||state.nonces.includes(grant.nonce))throw new Error('Authorization grant was already used or local replay history is invalid.');
  state.nonces=[...state.nonces,grant.nonce].slice(-256);
  const temporary=statePath+'.tmp',handle=await fs.open(temporary,'wx',0o600);try{await handle.writeFile(JSON.stringify(state)+'\n');await handle.sync();}finally{await handle.close();}await fs.rename(temporary,statePath);
  return{grant,secrets};
}
try {
  if(!configFile || !['enroll','service','helper','request-stop','request-uninstall','consume-local-operation-grant','complete-local-operation'].includes(command)) throw new Error('Usage: node src/cli.js enroll|service|helper|request-stop|request-uninstall <absolute config.json> [arguments]');
  const config=await readConfig(configFile);
  if(command==='enroll') {
    if(process.stdin.isTTY) throw new Error('Provide the enrollment token on stdin, not command line');
    let token='';for await(const b of process.stdin){token+=b;if(token.length>256)throw new Error('Enrollment input is too long. Copy only the 43-character token, without labels or JSON.');}
    const result=await enroll(config,token);console.log(JSON.stringify(result));
  }else if(command==='service') await runService(config);
  else if(command==='helper') await runDesktopHelper(config);
  else if(command==='request-stop'||command==='request-uninstall'){
    const reason=args.join(' ').trim();if(reason.length<8||reason.length>500)throw new Error('Provide a reason containing 8–500 characters. No agent change was made.');
    const result=await requestLocalOperationFromDesktop(config,command==='request-stop'?'SERVICE_STOP':'AGENT_UNINSTALL',reason);
    if(!result.localOperationRequest?.success)throw new Error('The enrolled service did not accept the request.');
    console.log(JSON.stringify({requestId:result.localOperationRequest.requestId,status:result.localOperationRequest.status,expiresAt:result.localOperationRequest.expiresAt,message:'Pending Main Admin approval. No local operation has occurred.'}));
  }else if(command==='consume-local-operation-grant'){
    if(!['SERVICE_STOP','AGENT_UNINSTALL'].includes(args[0]))throw new Error('Specify SERVICE_STOP or AGENT_UNINSTALL.');
    const {grant}=await consumeLocalGrant(config,args[0]);console.log(JSON.stringify(grant));
  }else{
    const [requestId,nonce]=args;if(!/^[0-9a-f-]{36}$/i.test(requestId||'')||!/^[0-9a-f-]{36}$/i.test(nonce||''))throw new Error('Invalid operation completion reference.');
    const secrets=await new CredentialStore(config.dataDirectory).load(),result=await new Transport(config,secrets.credential).post(`local-operation-requests/${requestId}/complete`,{nonce,result:'SUCCEEDED'});console.log(JSON.stringify(result));
  }
}catch(e){console.error(e.message);process.exitCode=1;}
