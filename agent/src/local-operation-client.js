import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {nativeInput} from './native.js';
import {sendSample} from './ipc.js';
import {LOCAL_OPERATION_ACTIONS} from './local-operation-auth.js';
import {assertUserConfig,ownedPath} from './macos-user.js';

export async function requestLocalOperationFromDesktop(config,action,reason){
  if(!LOCAL_OPERATION_ACTIONS.includes(action)||typeof reason!=='string'||reason.trim().length<8||reason.trim().length>500)throw new Error('Choose SERVICE_STOP or AGENT_UNINSTALL and provide an 8–500 character reason.');
  if(process.platform==='darwin'){
    if(config.installMode!=='user'||action!=='AGENT_UNINSTALL')throw new Error('Only the enrolled macOS employee LaunchAgent may request Main Admin-authorized uninstallation. Root LaunchDaemon management remains a separate administrator workflow.');
    const context=assertUserConfig(config),helperFile=path.join(config.dataDirectory,'helper-capability.json');
    await ownedPath(config.dataDirectory,context.uid,{directory:true});await ownedPath(helperFile,context.uid);
    const helper=JSON.parse(await fs.readFile(helperFile,'utf8'));
    if(typeof helper.key!=='string'||helper.identity!==context.identity)throw new Error('This macOS account is not mapped to this enrolled agent.');
    const portText=await fs.readFile(path.join(config.dataDirectory,'ipc-port'),'utf8'),port=Number(portText);
    if(!/^\d{1,5}$/.test(portText)||!Number.isInteger(port)||port<1||port>65535)throw new Error('The enrolled macOS service is not accepting a local authorization request.');
    return sendSample(helper,{kind:'local-operation-request',action,reason:reason.trim(),requestId:randomUUID(),requestedAt:new Date().toISOString(),identity:helper.identity},{port});
  }
  if(process.platform!=='win32')throw new Error('Local operation authorization is supported only by Windows service and macOS employee agents.');
  const helperFile=path.join(config.dataDirectory,'helper.dpapi');
  const helper=JSON.parse(await nativeInput('vault.ps1',{action:'unprotect',value:await fs.readFile(helperFile,'utf8')}));
  if(typeof helper.key!=='string'||helper.identity!==config.desktopIdentity&&config.desktopIdentity)throw new Error('This Windows account is not mapped to this enrolled agent.');
  return sendSample(helper,{kind:'local-operation-request',action,reason:reason.trim(),requestId:randomUUID(),requestedAt:new Date().toISOString(),identity:helper.identity});
}
