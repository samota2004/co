import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {exec} from './native.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const uidOf = identity => {
  if (!/^uid:(0|[1-9]\d{0,9})$/.test(identity || '')) throw new Error('UNSAFE_ACCOUNT');
  return Number(identity.slice(4));
};
const safeName = name => /^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(name);
async function command(file,args) {
  try {return (await exec(file,args,{timeout:10000,maxBuffer:131072,env:{PATH:'/usr/sbin:/usr/bin:/sbin:/bin',LANG:'C',LC_ALL:'C'}})).stdout.trim();}
  catch(error){if(file==='/bin/ps' && error.code===1 && !error.stdout?.trim() && !error.stderr?.trim())return '';throw error;}
}

export class UnixAccounts {
  constructor(platform, run=command, read=file=>fs.readFile(file,'utf8')) { this.platform=platform;this.run=run;this.read=read; }
  async inspect(uid) {
    if (this.platform==='linux') {
      const matches=(await this.read('/etc/passwd')).split('\n').map(x=>x.split(':')).filter(x=>Number(x[2])===uid && x.length>=7);
      if(matches.length!==1)throw new Error('UNSAFE_ACCOUNT');
      const row=matches[0], name=row[0];if(!safeName(name))throw new Error('UNSAFE_ACCOUNT');
      const groups=(await this.run('/usr/bin/id',['-nG',name])).split(/\s+/);
      // Direct sudoers grants need not appear in sudo/wheel group membership.
      // Missing/unreadable sudo policy is an unsafe preflight, not permission to
      // disable an account that might be the machine's recovery administrator.
      let sudoPolicy='';
      try {sudoPolicy=await this.run('/usr/bin/sudo',['-n','-l','-U',name]);}
      catch(error){if(error.code!==1 || !/(not allowed to run sudo|may not run sudo)/.test(String(error.stderr || '')+'\n'+String(error.stdout || '')))throw new Error('UNSAFE_ACCOUNT');}
      const sudoGrant=/may run the following commands/.test(sudoPolicy);
      const recoveryGrant=/\(\s*(?:ALL|root)\s*(?::[^)]*)?\)\s*(?:NOPASSWD:\s*)?ALL(?:\s|$)/m.test(sudoPolicy);
      const shadow=(await this.read('/etc/shadow')).split('\n').map(x=>x.split(':')).find(x=>x[0]===name);
      if(!shadow || !shadow[1])throw new Error('UNSAFE_ACCOUNT');
      const expiry=shadow[7] || '';
      return {uid,name,admin:uid===0 || sudoGrant || groups.some(g=>['sudo','wheel','admin'].includes(g)),recoveryCapable:uid===0 || recoveryGrant,
        interactive:!/(nologin|false)$/.test(row[6]), disabled:/^[!*]/.test(shadow[1]) || Boolean(expiry && Number(expiry)<=Math.floor(Date.now()/86400000)),
        expiry,locked:shadow[1].startsWith('!'),fingerprint:digest(shadow[1].replace(/^!/,'')),local:true};
    }
    if(this.platform!=='darwin')throw new Error('UNSUPPORTED_MACHINE');
    const listing=await this.run('/usr/bin/dscl',['.','-list','/Users','UniqueID']);
    const names=listing.split('\n').map(x=>x.trim().split(/\s+/)).filter(x=>Number(x[1])===uid);
    if(names.length!==1 || !safeName(names[0][0]))throw new Error('UNSAFE_ACCOUNT');
    const name=names[0][0];
    const attrs=await this.run('/usr/bin/dscl',['.','-read','/Users/'+name,'AuthenticationAuthority','UserShell']);
    const policy=await this.run('/usr/bin/pwpolicy',['-n','/Local/Default','-u',name,'-getpolicy']);
    const groups=(await this.run('/usr/bin/id',['-Gn',name])).split(/\s+/);
    const shell=attrs.match(/^UserShell:\s*(\S+)/m)?.[1];
    return {uid,name,admin:uid===0 || groups.includes('admin'),interactive:Boolean(shell && !/(nologin|false)$/.test(shell)),
      disabled:/;DisabledUser;|isDisabled=1/.test(attrs+'\n'+policy),
      // Network/mobile identities and secure-token/FileVault users require MDM recovery controls.
      local:!/LocalCachedUser|SecureToken/.test(attrs), fingerprint:digest(attrs+'\n'+policy)};
  }
  async block(user) {
    if(this.platform==='linux')await this.run('/usr/sbin/usermod',['--expiredate','1','--lock',user.name]);
    else await this.run('/usr/bin/pwpolicy',['-n','/Local/Default','-u',user.name,'-disableuser']);
  }
  async allow(user, before) {
    if(this.platform==='linux')await this.run('/usr/sbin/usermod',['--expiredate',before.expiry,'--unlock',user.name]);
    else await this.run('/usr/bin/pwpolicy',['-n','/Local/Default','-u',user.name,'-enableuser']);
  }
  async endSessions(user) {
    if(this.platform==='linux') {
      if(!(await this.run('/bin/ps',['-U',String(user.uid),'-o','pid='])).trim())return true;
      try{await this.run('/usr/bin/loginctl',['terminate-user',String(user.uid)]);}catch{}
      try{await this.run('/usr/bin/pkill',['-KILL','-U',String(user.uid)]);}catch{}
    }
    else {
      // Missing GUI session is harmless; terminate any remaining user sessions too.
      try {await this.run('/bin/launchctl',['bootout','gui/'+user.uid]);}catch{}
      try {await this.run('/usr/bin/pkill',['-KILL','-U',String(user.uid)]);}catch{}
    }
    try {return !(await this.run('/bin/ps',['-U',String(user.uid),'-o','pid='])).trim();}
    catch{return false;}
  }
}

export async function protectedPath(target, {file=false}={}) {
  const resolved=path.resolve(target);
  for(let p=resolved;;p=path.dirname(p)) {
    const stat=await fs.lstat(p);
    if(stat.isSymbolicLink() || stat.uid!==0 || (stat.mode & 0o022) ||
      (p===resolved && (file ? !stat.isFile() || (stat.mode & 0o077) : !stat.isDirectory())))throw new Error('UNSAFE_STORAGE');
    if(p===path.dirname(p))break;
  }
}
export async function readJournal(directory) {
  await protectedPath(directory);
  const file=path.join(directory,'unix-account-control.json');
  try {await protectedPath(file,{file:true});return JSON.parse(await fs.readFile(file,'utf8'));}
  catch(e){if(e.code==='ENOENT')return null;throw e;}
}
export async function writeJournal(directory,state) {
  await protectedPath(directory);
  const file=path.join(directory,'unix-account-control.json');
  if(state===null){await fs.unlink(file);return;}
  const tmp=file+'.'+process.pid+'.tmp';
  const handle=await fs.open(tmp,'wx',0o600);
  try {await handle.writeFile(JSON.stringify(state));await handle.sync();}finally{await handle.close();}
  await fs.rename(tmp,file);
  const dir=await fs.open(directory,'r');try{await dir.sync();}finally{await dir.close();}
}

// Injected adapters are used only by tests; runtime always uses OS commands and
// a root-owned journal. No passwords, hashes, tokens or command output are logged.
export async function applyUnixAccountControl(request, {
  platform=process.platform, root=()=>process.getuid?.()===0,
  accounts=new UnixAccounts(platform), read=readJournal, write=writeJournal,
}={}) {
  let code='NATIVE_ERROR';
  try {
    if(!root())return {code:'ACCESS_DENIED'};
    if(!['linux','darwin'].includes(platform))return {code:'UNSUPPORTED_MACHINE'};
    if(!['CHECK','BLOCK','ALLOW'].includes(request.action))return {code:'UNSAFE_ACCOUNT'};
    code='UNSAFE_ACCOUNT';
    const uid=uidOf(request.employeeIdentity), recoveryUid=uidOf(request.recoveryAdminIdentity);
    if(uid<(platform==='linux'?1000:501) || uid===recoveryUid)return {code};
    const employee=await accounts.inspect(uid);
    if(employee.admin || !employee.local || !employee.interactive)return {code};
    code='UNSAFE_RECOVERY';const recovery=await accounts.inspect(recoveryUid);
    if(!recovery.admin || recovery.recoveryCapable===false || recovery.disabled || !recovery.interactive)return {code};
    if(request.action==='CHECK')return {code:'READY',employeeEnabled:!employee.disabled};
    code='UNSAFE_STORAGE';
    if(!path.isAbsolute(request.stateDirectory || '') || !/^[a-f0-9-]{36}$/i.test(request.deviceId || ''))return {code};
    let state=await read(request.stateDirectory);
    code='RECOVERY_REQUIRED';
    if(state && (state.deviceId!==request.deviceId || state.employeeIdentity!==request.employeeIdentity ||
        state.phase!=='BLOCKED' || state.platform!==platform || state.name!==employee.name ||
        state.blockedFingerprint!==employee.fingerprint || (platform==='linux' && (employee.expiry!=='1' || !employee.locked))))return {code};
    if(request.action==='ALLOW') {
      if(!state)return {code:employee.disabled?'EXTERNALLY_DISABLED':'ALLOWED'};
      await accounts.allow(employee,state.before);
      if((await accounts.inspect(uid)).disabled)return {code:'RECOVERY_REQUIRED'};
      await write(request.stateDirectory,null);return {code:'ALLOWED'};
    }
    if(!state) {
      if(employee.disabled)return {code:'EXTERNALLY_DISABLED'};
      state={platform,deviceId:request.deviceId,employeeIdentity:request.employeeIdentity,name:employee.name,
        phase:'PREPARED',before:{expiry:employee.expiry || ''}};
      await write(request.stateDirectory,state);
      await accounts.block(employee);
      const blocked=await accounts.inspect(uid);
      if(!blocked.disabled || (platform==='linux' && (!blocked.locked || blocked.expiry!=='1')))return {code:'RECOVERY_REQUIRED'};
      state.phase='BLOCKED';state.blockedFingerprint=blocked.fingerprint;
      await write(request.stateDirectory,state);
    }
    return {code:await accounts.endSessions(employee)?'BLOCKED':'LOGOFF_PENDING'};
  }catch{return {code};}
}
