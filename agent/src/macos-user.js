import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export function userContext({platform=process.platform, user=os.userInfo(), hostname=os.hostname(), arch=os.arch(), release=os.release()}={}) {
  if(platform!=='darwin' || !Number.isSafeInteger(user.uid) || user.uid<=0 || !user.username || !path.isAbsolute(user.homedir)) throw new Error('Use your logged-in macOS account, without sudo');
  return {uid:user.uid, username:user.username, home:user.homedir, identity:`uid:${user.uid}`, hostname, arch, release,
    root:path.join(user.homedir,'Library','Application Support','CYBERORBIT')};
}
export function assertUserConfig(config, context=userContext()) {
  if(config.installMode!=='user' || config.desktopIdentity!==context.identity ||
    config.dataDirectory!==path.join(context.root,'data') || config.unixAccountControl?.enabled) throw new Error('User installation identity or paths differ from the current account');
  if(config.consent?.disclosureVersion!==1 || !Number.isFinite(Date.parse(config.consent?.acceptedAt)))throw new Error('Employee monitoring disclosure consent is required');
  return context;
}
export function assertEnrollment(secrets, config, context=userContext()) {
  assertUserConfig(config,context);
  if(secrets.mappedIdentity!==context.identity || secrets.deviceId!==config.expectedDeviceId ||
     !/^[A-Za-z0-9_-]{43}$/.test(secrets.credential || '')) throw new Error('Stored enrollment differs from this account or assigned device');
}
export async function macosFacts(context=userContext()) {
  const {stdout}=await promisify(execFile)('/usr/bin/sw_vers',['-productVersion'],{timeout:5000});
  const osVersion=stdout.trim();
  if(!/^\d+(\.\d+){0,2}$/.test(osVersion))throw new Error('macOS version unavailable');
  return {...context,osVersion};
}
export async function ownedPath(file, uid, {directory=false}={}) {
  const st=await fs.lstat(file);
  if(st.isSymbolicLink() || st.uid!==uid || (st.mode&0o022) || (!directory && st.nlink!==1) || (directory?!st.isDirectory():!st.isFile())) throw new Error('Unsafe ownership, permissions or symbolic link: '+file);
  if(await fs.realpath(file)!==path.resolve(file)) throw new Error('Symbolic links are not permitted in installation paths');
}
export function xml(value) {return String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));}
export function launchAgent(context) {
  const root=context.root;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.cyberorbit.user-agent</string>
<key>ProgramArguments</key><array>${[path.join(root,'app/runtime/node'),path.join(root,'app/src/cli.js'),'service',path.join(root,'config.json')].map(s=>`<string>${xml(s)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>LimitLoadToSessionType</key><string>Aqua</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>ThrottleInterval</key><integer>30</integer><key>ExitTimeOut</key><integer>20</integer>
<key>Umask</key><integer>63</integer>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string><key>NODE_OPTIONS</key><string></string></dict>
<key>StandardOutPath</key><string>${xml(path.join(root,'logs/launchd.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(root,'logs/launchd.log'))}</string>
</dict></plist>\n`;
}
