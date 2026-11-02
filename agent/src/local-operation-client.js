import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {nativeInput} from './native.js';
import {sendSample} from './ipc.js';
import {LOCAL_OPERATION_ACTIONS} from './local-operation-auth.js';

export async function requestLocalOperationFromDesktop(config,action,reason){
  if(process.platform!=='win32')throw new Error('Local service stop and uninstall authorization requests are currently supported only by the Windows service agent.');
  if(!LOCAL_OPERATION_ACTIONS.includes(action)||typeof reason!=='string'||reason.trim().length<8||reason.trim().length>500)throw new Error('Choose SERVICE_STOP or AGENT_UNINSTALL and provide an 8–500 character reason.');
  const helperFile=path.join(config.dataDirectory,'helper.dpapi');
  const helper=JSON.parse(await nativeInput('vault.ps1',{action:'unprotect',value:await fs.readFile(helperFile,'utf8')}));
  if(typeof helper.key!=='string'||helper.identity!==config.desktopIdentity&&config.desktopIdentity)throw new Error('This Windows account is not mapped to this enrolled agent.');
  return sendSample(helper,{kind:'local-operation-request',action,reason:reason.trim(),requestId:randomUUID(),requestedAt:new Date().toISOString(),identity:helper.identity});
}
