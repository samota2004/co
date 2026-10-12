import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exec} from './native.js';
import {validateServerUrl} from './config.js';
import {CredentialStore} from './credential-store.js';
import {applyUnixAccountControl,protectedPath} from './unix-account-control.js';

export function options(args) {
  const out={};
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(['--browser-titles','--recovery-login-verified','--migrate-credentials'].includes(key))out[key]=true;
    else if(['--server','--employee','--recovery-admin'].includes(key) && args[i+1] && !args[i+1].startsWith('--'))out[key]=args[++i];
    else throw new Error('Use --server HTTPS_ORIGIN --employee LOCAL_USERNAME [--browser-titles] [--recovery-admin LOCAL_USERNAME --recovery-login-verified] [--migrate-credentials]');
  }
  return out;
}
async function localUid(name) {
  if(!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(name || ''))throw new Error('A local username is required');
  const uid=Number((await exec('/usr/bin/id',['-u',name],{timeout:5000})).stdout.trim());
  if(!Number.isSafeInteger(uid) || uid< (process.platform==='linux'?1000:501))throw new Error('Choose an ordinary desktop account');
  return uid;
}
async function secureDirectory(directory,mode) {
  await fs.mkdir(directory,{recursive:true,mode});
  await protectedPath(directory);
  await fs.chmod(directory,mode);
}
export async function configureUnix(args) {
  if(!['linux','darwin'].includes(process.platform) || process.getuid()!==0)throw new Error('Run as root on the target Linux or macOS computer');
  const o=options(args),linux=process.platform==='linux';
  const file=linux?'/etc/cyberorbit/config.json':'/Library/CYBERORBIT/config.json';
  const uid=await localUid(o['--employee']);
  await secureDirectory(path.dirname(file),0o755);
  let old={};try{await protectedPath(file,{file:true});old=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){
    // The public config is root-owned/readable for the session helper.
    if(e.code!=='ENOENT') {
      const st=await fs.lstat(file);
      if(!st.isFile() || st.isSymbolicLink() || st.uid!==0 || (st.mode&0o022))throw e;
      old=JSON.parse(await fs.readFile(file,'utf8'));
    }
  }
  const serverUrl=validateServerUrl(o['--server'] || old.serverUrl);
  if(old.serverUrl && old.serverUrl!==serverUrl)throw new Error('Changing an enrolled server needs a separately reviewed migration');
  const dataDirectory=old.dataDirectory || (linux?'/var/lib/cyberorbit':'/Library/Application Support/CYBERORBIT');
  await secureDirectory(dataDirectory,0o700);
  const capabilityDirectory=linux?'/var/lib/cyberorbit-desktop':'/Library/Application Support/CYBERORBIT-desktop';
  await secureDirectory(capabilityDirectory,0o711);
  const helperCapabilityFile=path.join(capabilityDirectory,uid+'.json');
  const config={...old,serverUrl,dataDirectory,locallyApprovedDirectories:old.locallyApprovedDirectories || [],
    desktopIdentity:'uid:'+uid,helperCapabilityFile,superviseDesktop:true,browserTitles:o['--browser-titles'] || old.browserTitles===true};
  if(o['--recovery-admin']) {
    if(!o['--recovery-login-verified'])throw new Error('First verify a separate recovery administrator can sign in, then supply --recovery-login-verified');
    const recovery=await localUid(o['--recovery-admin']);
    const result=await applyUnixAccountControl({action:'CHECK',employeeIdentity:config.desktopIdentity,recoveryAdminIdentity:'uid:'+recovery});
    if(result.code!=='READY' || !result.employeeEnabled)throw new Error('OS account-control preflight refused: '+result.code);
    config.unixAccountControl={enabled:true,employeeIdentity:config.desktopIdentity,recoveryAdminIdentity:'uid:'+recovery,recoveryLoginVerified:true};
  }
  let enrolled=false;
  try{await fs.access(path.join(dataDirectory,'enrollment-marker'));enrolled=true;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(enrolled) {
    const store=new CredentialStore(dataDirectory), secrets=await store.load();
    if(secrets.mappedIdentity!==config.desktopIdentity)throw new Error('Employee UID differs from existing enrollment; existing identity and queue preserved');
    if(o['--migrate-credentials'])await store.save(secrets);
    // New sibling location fixes traversal without exposing the queue/credential directory.
    const temp=helperCapabilityFile+'.tmp';
    await fs.writeFile(temp,JSON.stringify({key:secrets.helperKey,identity:secrets.mappedIdentity}),{mode:0o400,flag:'wx'});
    await fs.chown(temp,uid,0);await fs.rename(temp,helperCapabilityFile);
  }
  const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o644,flag:'wx'});await fs.rename(temp,file);
  console.log('Configuration saved. Desktop UID: '+uid+'. Enrollment and queue preserved. '+(enrolled?'Run the installer to restart services.':'Enroll using a token on stdin, then run the installer.'));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))configureUnix(process.argv.slice(2)).catch(()=>{console.error('Unix configuration failed. Check root ownership, local UID, existing enrollment and recovery preflight. No credentials are printed.');process.exitCode=1;});
