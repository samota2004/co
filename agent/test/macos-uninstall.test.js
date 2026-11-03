import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {localOperationKey,signLocalOperationGrant,verifyLocalOperationGrant} from '../src/local-operation-auth.js';
import {consumeMacUninstallGrant,executeAuthorizedMacUninstall,recoverConfirmedMacUninstall,waitForMacUninstallGrant} from '../src/macos-uninstall.js';
import {Transport} from '../src/uploader.js';

function fixture(){
  const credential=randomBytes(32).toString('base64url'),secrets={credential,deviceId:randomUUID()},identity='uid:501',now=Date.now();
  const grant={version:1,requestId:randomUUID(),deviceId:secrets.deviceId,identity,action:'AGENT_UNINSTALL',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),nonce:randomUUID()};
  grant.signature=signLocalOperationGrant(localOperationKey(credential),grant);
  return{secrets,identity,grant,now,config:{installMode:'user',desktopIdentity:identity,dataDirectory:'/employee/data'},context:{uid:501,identity,root:'/employee/CYBERORBIT',home:'/employee'}};
}

test('macOS uninstall grants reject expiry, device, action and signature mismatch',()=>{
  const f=fixture(),key=localOperationKey(f.secrets.credential),expected={deviceId:f.secrets.deviceId,identity:f.identity,action:'AGENT_UNINSTALL',now:f.now};
  assert.equal(verifyLocalOperationGrant(key,f.grant,expected),true);
  assert.equal(verifyLocalOperationGrant(key,f.grant,{...expected,now:f.now+60000}),false);
  assert.equal(verifyLocalOperationGrant(key,f.grant,{...expected,deviceId:randomUUID()}),false);
  assert.equal(verifyLocalOperationGrant(key,f.grant,{...expected,action:'SERVICE_STOP'}),false);
  assert.equal(verifyLocalOperationGrant(key,{...f.grant,nonce:randomUUID()},expected),false);
});

test('macOS grant consumption records a nonce once and rejects replay',async t=>{
  const f=fixture(),directory=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-mac-uninstall-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const grantPath=path.join(directory,'local-operation-grant.json');await fs.writeFile(grantPath,JSON.stringify(f.grant),{mode:0o600});
  const validateOwnedPath=async()=>{};
  assert.deepEqual(await consumeMacUninstallGrant({directory,grant:f.grant,secrets:f.secrets,identity:f.identity,now:f.now,validateOwnedPath}),f.grant);
  await fs.writeFile(grantPath,JSON.stringify(f.grant),{mode:0o600});
  await assert.rejects(consumeMacUninstallGrant({directory,grant:f.grant,secrets:f.secrets,identity:f.identity,now:f.now,validateOwnedPath}),/already used/);
});

test('Main Admin grant must be acknowledged by the authenticated backend before uninstall proceeds',async t=>{
  const f=fixture(),events=[],directory=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-mac-grant-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const grantFile=path.join(directory,'local-operation-grant.json');await fs.writeFile(grantFile,JSON.stringify(f.grant));
  const result=await waitForMacUninstallGrant({transport:{get:async route=>{events.push(route);return{requestId:f.grant.requestId,action:'AGENT_UNINSTALL',status:'AUTH_EXECUTING',expiresAt:f.grant.expiresAt};}},requestId:f.grant.requestId,grantFile,secrets:f.secrets,identity:f.identity,now:()=>f.now,sleep:async()=>{},timeoutMs:1000});
  assert.equal(result.requestId,f.grant.requestId);assert.deepEqual(events,[`local-operation-requests/${f.grant.requestId}/status`]);
});

test('authenticated operation-status polling uses GET with the enrolled credential',async()=>{
  const credential=randomBytes(32).toString('base64url');let request;
  const transport=new Transport({serverUrl:'https://cyberorbit.example'},credential,async(url,options)=>{
    request={url,options};return new Response(JSON.stringify({success:true,status:'AUTH_EXECUTING'}),{status:200,headers:{'Content-Type':'application/json'}});
  });
  const result=await transport.get('local-operation-requests/request-id/status');
  assert.equal(result.status,'AUTH_EXECUTING');assert.equal(request.options.method,'GET');
  assert.equal(request.options.headers.Authorization,`Bearer ${credential}`);assert.equal(request.url,'https://cyberorbit.example/api/endpoint/local-operation-requests/request-id/status');
});

test('authorized uninstall ordering revokes only after daemon shutdown and retains queue evidence',async()=>{
  const f=fixture(),order=[];
  const result=await executeAuthorizedMacUninstall({ ...f,operations:{
    prepare:async()=>{order.push('prepare');return{data:'/data',target:'gui/501/agent',browserManifests:[]};},
    consume:async()=>order.push('consume'),stop:async()=>order.push('stop'),waitStopped:async()=>{order.push('stopped');return async()=>order.push('release');},
    complete:async()=>{order.push('revoke');return{status:'AUTH_COMPLETED',credentialRevoked:true};},markRevoked:async()=>order.push('marker'),removeCredential:async()=>order.push('keychain'),removePlist:async()=>order.push('plist'),removeBrowserManifest:async()=>order.push('browser'),removeApp:async()=>order.push('app')
  }});
  assert.deepEqual(order,['prepare','consume','stop','stopped','revoke','marker','keychain','plist','app','release']);
  assert.equal(result.queueRetained,true);assert.equal(result.enrollmentEvidenceRetained,true);
});

test('successful app cleanup leaves encrypted queue and enrollment marker on disk',async t=>{
  const f=fixture(),root=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-mac-data-retention-')),app=path.join(root,'app'),data=path.join(root,'data');
  t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(app);await fs.mkdir(path.join(data,'queue'),{recursive:true});
  await fs.writeFile(path.join(app,'agent.js'),'installed');await fs.writeFile(path.join(data,'queue','event-1.event'),'ciphertext');await fs.writeFile(path.join(data,'enrollment-marker'),f.secrets.deviceId);
  await executeAuthorizedMacUninstall({...f,operations:{prepare:async()=>({app,data,browserManifests:[]}),consume:async()=>{},stop:async()=>{},waitStopped:async()=>async()=>{},complete:async()=>({status:'AUTH_COMPLETED',credentialRevoked:true}),markRevoked:async()=>{},removeCredential:async()=>{},removePlist:async()=>{},removeBrowserManifest:async()=>{},removeApp:async target=>fs.rm(target,{recursive:true})}});
  await assert.rejects(fs.access(app));assert.equal(await fs.readFile(path.join(data,'queue','event-1.event'),'utf8'),'ciphertext');
  assert.equal(await fs.readFile(path.join(data,'enrollment-marker'),'utf8'),f.secrets.deviceId);
});

test('failed launchd shutdown never calls server revocation or removes credentials/files',async()=>{
  const f=fixture(),order=[];
  await assert.rejects(executeAuthorizedMacUninstall({...f,operations:{
    prepare:async()=>({}),consume:async()=>order.push('consume'),stop:async()=>{order.push('stop');throw new Error('bootout denied');},waitStopped:async()=>order.push('wait'),complete:async()=>order.push('revoke'),fail:async()=>order.push('failure-report'),markRevoked:async()=>order.push('marker'),removeCredential:async()=>order.push('keychain'),removePlist:async()=>order.push('plist'),removeBrowserManifest:async()=>order.push('browser'),removeApp:async()=>order.push('app')
  }}),error=>error.name==='MacUninstallFailure'&&error.step==='LaunchAgent shutdown');
  assert.deepEqual(order,['consume','stop','failure-report']);
});

test('server failure after shutdown preserves Keychain credential, queue and enrollment evidence',async()=>{
  const f=fixture(),order=[];
  await assert.rejects(executeAuthorizedMacUninstall({...f,operations:{
    prepare:async()=>({browserManifests:[]}),consume:async()=>order.push('consume'),stop:async()=>order.push('stop'),waitStopped:async()=>async()=>order.push('release'),
    complete:async()=>{order.push('revoke');throw new Error('backend offline');},markRevoked:async()=>order.push('marker'),removeCredential:async()=>order.push('keychain'),removePlist:async()=>order.push('plist'),removeBrowserManifest:async()=>order.push('browser'),removeApp:async()=>order.push('app')
  }}),error=>error.name==='MacUninstallFailure'&&error.step==='server credential revocation');
  assert.deepEqual(order,['consume','stop','revoke','release']);
});

test('partial cleanup reports completed revocation and retains local data',async()=>{
  const f=fixture(),order=[];
  await assert.rejects(executeAuthorizedMacUninstall({...f,operations:{
    prepare:async()=>({browserManifests:[]}),consume:async()=>{},stop:async()=>{},waitStopped:async()=>async()=>{},complete:async()=>({status:'AUTH_COMPLETED',credentialRevoked:true}),markRevoked:async()=>order.push('marker'),removeCredential:async()=>order.push('keychain'),removePlist:async()=>{throw new Error('plist locked');},removeBrowserManifest:async()=>order.push('browser'),removeApp:async()=>order.push('app')
  }}),error=>error.name==='MacUninstallFailure'&&error.step==='LaunchAgent plist cleanup'&&error.completedSteps.includes('server credential revocation confirmed'));
  assert.deepEqual(order,['marker','keychain']);
});

test('confirmed-revocation recovery finishes partial cleanup without another grant and preserves the queue',async t=>{
  const f=fixture(),root=await fs.mkdtemp(path.join(os.tmpdir(),'cyberorbit-mac-recovery-')),app=path.join(root,'app'),data=path.join(root,'data');
  t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(app);await fs.mkdir(path.join(data,'queue'),{recursive:true});
  await fs.writeFile(path.join(app,'agent.js'),'installed');await fs.writeFile(path.join(data,'queue','event-1.event'),'ciphertext');await fs.writeFile(path.join(data,'enrollment-marker'),f.secrets.deviceId);
  const order=[],result=await recoverConfirmedMacUninstall({config:f.config,context:f.context,operations:{
    isRevoked:async()=>true,prepare:async()=>({app,data,browserManifests:[],target:'gui/501/agent'}),stop:async()=>order.push('stop'),
    waitStopped:async()=>{order.push('stopped');return async()=>order.push('release');},removeCredential:async()=>order.push('keychain'),
    removePlist:async()=>order.push('plist'),removeBrowserManifest:async()=>order.push('browser'),removeApp:async target=>{order.push('app');await fs.rm(target,{recursive:true});}
  }});
  assert.deepEqual(order,['stop','stopped','keychain','plist','app','release']);assert.equal(result.queueRetained,true);
  assert.equal(await fs.readFile(path.join(data,'queue','event-1.event'),'utf8'),'ciphertext');assert.equal(await fs.readFile(path.join(data,'enrollment-marker'),'utf8'),f.secrets.deviceId);
});

test('confirmed-revocation recovery is idempotent when the app and plist were already removed',async()=>{
  const f=fixture(),order=[];
  const result=await recoverConfirmedMacUninstall({config:f.config,context:f.context,operations:{
    isRevoked:async()=>true,prepare:async()=>({app:null,data:'/data',plist:null,browserManifests:[],target:'gui/501/agent'}),
    stop:async()=>order.push('stop'),waitStopped:async()=>async()=>order.push('release'),removeCredential:async()=>order.push('keychain'),
    removePlist:async plist=>{if(plist)order.push('plist');},removeBrowserManifest:async()=>order.push('browser'),removeApp:async app=>{if(app)order.push('app');}
  }});
  assert.deepEqual(order,['stop','keychain','release']);assert.equal(result.queueRetained,true);
  await assert.rejects(recoverConfirmedMacUninstall({config:f.config,context:f.context,operations:{isRevoked:async()=>false}}),/Main Admin authorization is required/);
});

test('unapproved or malformed grant cannot reach uninstall preparation',async()=>{
  const f=fixture(),order=[];f.grant.action='SERVICE_STOP';
  await assert.rejects(executeAuthorizedMacUninstall({...f,operations:{prepare:async()=>order.push('prepare')}}),/fresh Main Admin grant/);
  assert.deepEqual(order,[]);
});
