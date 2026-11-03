import fs from 'node:fs/promises';
import path from 'node:path';
import {localOperationKey,verifyLocalOperationGrant} from './local-operation-auth.js';
import {ownedPath} from './macos-user.js';
import {acquireUserLock} from './user-lock.js';
import {browserHosts} from './browser-native-host.js';

export class MacUninstallFailure extends Error {
  constructor(step,cause,completedSteps){
    super(`Authorized macOS uninstall stopped at ${step}; completed: ${completedSteps.join(', ')||'none'}. ${cause?.message||'Operation failed.'}`,{cause});
    this.name='MacUninstallFailure';this.step=step;this.completedSteps=[...completedSteps];
  }
}

async function validateOwnedTree(directory,uid){
  await ownedPath(directory,uid,{directory:true});
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    const child=path.join(directory,item.name);
    if(item.isSymbolicLink()||(!item.isDirectory()&&!item.isFile()))throw new Error('Uninstall tree contains a symbolic link or special file; no cleanup performed.');
    if(item.isDirectory())await validateOwnedTree(child,uid);else await ownedPath(child,uid);
  }
}

export async function prepareMacUninstallFiles({config,context,allowMissingArtifacts=false}){
  if(config.installMode!=='user'||context.uid!==Number(context.identity.slice(4))||config.desktopIdentity!==context.identity||config.dataDirectory!==path.join(context.root,'data'))throw new Error('Only the matching employee LaunchAgent installation can use this uninstall workflow.');
  const app=path.join(context.root,'app'),data=config.dataDirectory,plist=path.join(context.home,'Library','LaunchAgents','com.cyberorbit.user-agent.plist');
  await ownedPath(context.root,context.uid,{directory:true});await ownedPath(path.join(context.root,'config.json'),context.uid);
  await ownedPath(data,context.uid,{directory:true});
  let appExists=true;try{await validateOwnedTree(app,context.uid);}catch(error){if(!allowMissingArtifacts||error.code!=='ENOENT')throw error;appExists=false;}
  let plistExists=true;try{await ownedPath(plist,context.uid);}catch(error){if(!allowMissingArtifacts||error.code!=='ENOENT')throw error;plistExists=false;}
  if(plistExists){
    const plistText=await fs.readFile(plist,'utf8');
    if(!plistText.includes('com.cyberorbit.user-agent')||!plistText.includes(path.join(app,'src','cli.js'))||!plistText.includes(path.join(app,'runtime','node')))throw new Error('LaunchAgent plist does not match this installed employee agent; preserve it for review.');
  }
  const browserManifests=[];
  for(const browser of Object.keys(config.browserCompanions||{})){
    const host=browserHosts[browser];if(!host)throw new Error('Unknown registered browser companion; preserve all files for review.');
    const manifest=path.join(context.home,'Library','Application Support',host.directory,'com.cyberorbit.browser.json');
    try{await ownedPath(manifest,context.uid);}catch(error){if(allowMissingArtifacts&&error.code==='ENOENT')continue;throw error;}
    const value=JSON.parse(await fs.readFile(manifest,'utf8'));
    if(value.path!==path.join(context.root,`browser-${browser}.sh`))throw new Error('Browser host registration differs from this installation; preserve it for review.');
    browserManifests.push(manifest);
  }
  return{app:appExists?app:null,data,plist:plistExists?plist:null,browserManifests,target:`gui/${context.uid}/com.cyberorbit.user-agent`};
}
export async function prepareMacUninstall({config,context,grant,secrets,now=Date.now()}){
  if(!verifyLocalOperationGrant(localOperationKey(secrets.credential),grant,{deviceId:secrets.deviceId,identity:context.identity,action:'AGENT_UNINSTALL',now}))throw new Error('A valid, fresh Main Admin grant for this enrolled Mac is required.');
  return prepareMacUninstallFiles({config,context});
}

export async function executeAuthorizedMacUninstall({config,context,grant,secrets,operations,now=Date.now()}){
  const completed=[];let step='verify authorization',serverRevocationConfirmed=false;
  try{
    if(!verifyLocalOperationGrant(localOperationKey(secrets.credential),grant,{deviceId:secrets.deviceId,identity:context.identity,action:'AGENT_UNINSTALL',now}))throw new Error('A valid, fresh Main Admin grant for this enrolled Mac is required.');
    step='uninstall preparation';
    const paths=await operations.prepare({config,context,grant,secrets,now});completed.push('installation and retention preflight');
    await operations.consume(grant);completed.push('one-time authorization consumed');
    step='LaunchAgent shutdown';await operations.stop(paths.target);completed.push('launchctl bootout requested');
    step='LaunchAgent shutdown confirmation';const release=await operations.waitStopped(paths.data,context.uid);completed.push('LaunchAgent confirmed stopped');
    try{
      step='server credential revocation';const result=await operations.complete(grant);
      if(result?.status!=='AUTH_COMPLETED'||result?.credentialRevoked!==true)throw new Error('Backend did not confirm credential revocation.');
      serverRevocationConfirmed=true;
      completed.push('server credential revocation confirmed');
      step='local revocation marker';await operations.markRevoked(paths.data);completed.push('local revocation marker recorded');
      step='Keychain credential removal';await operations.removeCredential();completed.push('revoked Keychain credential removed');
      step='LaunchAgent plist cleanup';await operations.removePlist(paths.plist);completed.push('LaunchAgent plist removed');
      step='browser host cleanup';for(const manifest of paths.browserManifests)await operations.removeBrowserManifest(manifest);completed.push('registered browser host manifests removed');
      step='installed binaries cleanup';await operations.removeApp(paths.app);completed.push('installed application files removed');
      return{requestId:grant.requestId,completedSteps:completed,queueRetained:true,enrollmentEvidenceRetained:true};
    } finally {await release();}
  }catch(error){
    if(!serverRevocationConfirmed&&operations.fail){
      try{await operations.fail(grant);}
      catch(reportError){error=new Error(`${error.message} The server could not record the failed uninstall attempt (${reportError.message}); local queue and enrollment evidence remain.`,{cause:error});}
    }
    throw new MacUninstallFailure(step,error,completed);
  }
}

export async function recoverConfirmedMacUninstall({config,context,operations}){
  const completed=[];let step='confirmed revocation marker';
  try{
    if(!await operations.isRevoked(config.dataDirectory))throw new Error('No confirmed server-revocation marker exists; Main Admin authorization is required.');
    const paths=await operations.prepare({config,context,allowMissingArtifacts:true});completed.push('retained installation preflight');
    step='LaunchAgent shutdown';await operations.stop(paths.target);completed.push('launchctl bootout requested');
    step='LaunchAgent shutdown confirmation';const release=await operations.waitStopped(paths.data,context.uid);completed.push('LaunchAgent confirmed stopped');
    try{
      step='Keychain credential cleanup';await operations.removeCredential();completed.push('local Keychain credential absent');
      step='LaunchAgent plist cleanup';await operations.removePlist(paths.plist);completed.push('LaunchAgent plist removed');
      step='browser host cleanup';for(const manifest of paths.browserManifests)await operations.removeBrowserManifest(manifest);completed.push('registered browser host manifests removed');
      step='installed binaries cleanup';await operations.removeApp(paths.app);completed.push('installed application files removed');
      return{completedSteps:completed,queueRetained:true,enrollmentEvidenceRetained:true};
    }finally{await release();}
  }catch(error){throw new MacUninstallFailure(step,error,completed);}
}

export async function waitForMacUninstallGrant({transport,requestId,grantFile,secrets,identity,now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),timeoutMs=15*60*1000}){
  const started=now(),statusRoute=`local-operation-requests/${requestId}/status`;
  while(now()-started<timeoutMs){
    const status=await transport.get(statusRoute);
    if(status.requestId!==requestId||status.action!=='AGENT_UNINSTALL')throw new Error('Backend returned a different operation request.');
    if(['AUTH_REJECTED','AUTH_EXPIRED','AUTH_FAILED','SUPERSEDED'].includes(status.status))throw new Error(`Main Admin uninstall authorization is ${status.status.toLowerCase()}. No local data was changed.`);
    if(status.status==='AUTH_EXECUTING'){
      try{
        const grant=JSON.parse(await fs.readFile(grantFile,'utf8'));
        if(verifyLocalOperationGrant(localOperationKey(secrets.credential),grant,{deviceId:secrets.deviceId,identity,action:'AGENT_UNINSTALL',now:now()}))return grant;
      }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
    }
    if(Date.parse(status.expiresAt)<=now())throw new Error('Main Admin uninstall authorization expired. No local data was changed.');
    await sleep(Math.min(2000,Math.max(100,Date.parse(status.expiresAt)-now())));
  }
  throw new Error('Timed out waiting for Main Admin approval. No local data was changed.');
}

export async function stopMacLaunchAgent(target,exec){
  try{await exec('/bin/launchctl',['print',target],{timeout:5000});}
  catch{return;}
  await exec('/bin/launchctl',['bootout',target],{timeout:20000});
}

export async function waitMacAgentStopped(dataDirectory,uid,{acquire=acquireUserLock,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  let lastError;
  for(let attempt=0;attempt<30;attempt++){
    try{return await acquire(dataDirectory);}
    catch(error){lastError=error;await sleep(500);}
  }
  throw new Error(`LaunchAgent did not release its exclusive service lock; no credential or files were removed. ${lastError?.message||''}`);
}

export async function consumeMacUninstallGrant({directory,grant,secrets,identity,now=Date.now(),validateOwnedPath=ownedPath}){
  await validateOwnedPath(directory,Number(identity.slice(4)),{directory:true});
  const lock=path.join(directory,'local-operation-consume.lock'),grantPath=path.join(directory,'local-operation-grant.json'),statePath=path.join(directory,'local-operation-consumed.json');
  await fs.mkdir(lock,{mode:0o700});
  try{
    await validateOwnedPath(lock,Number(identity.slice(4)),{directory:true});await validateOwnedPath(grantPath,Number(identity.slice(4)));
    const stored=JSON.parse(await fs.readFile(grantPath,'utf8'));
    if(JSON.stringify(stored)!==JSON.stringify(grant)||!verifyLocalOperationGrant(localOperationKey(secrets.credential),stored,{deviceId:secrets.deviceId,identity,action:'AGENT_UNINSTALL',now}))throw new Error('Main Admin grant changed, expired or is not for this enrolled Mac.');
    let state={version:1,nonces:[]};
    try{await validateOwnedPath(statePath,Number(identity.slice(4)));state=JSON.parse(await fs.readFile(statePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('Protected local authorization history is unavailable.');}
    if(state.version!==1||!Array.isArray(state.nonces)||state.nonces.length>256||state.nonces.includes(stored.nonce))throw new Error('Authorization grant was already used or local replay history is invalid.');
    state.nonces=[...state.nonces,stored.nonce].slice(-256);
    const temporary=statePath+'.tmp',handle=await fs.open(temporary,'wx',0o600);
    try{await handle.writeFile(JSON.stringify(state)+'\n');await handle.sync();}finally{await handle.close();}
    await fs.rename(temporary,statePath);await fs.unlink(grantPath);return stored;
  }finally{await fs.rm(lock,{recursive:true,force:true});}
}
