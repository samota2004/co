import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readConfig} from './config.js';
import {protectedPath} from './unix-account-control.js';
import {CredentialStore} from './credential-store.js';
export async function checkInstall(configFile) {
  if(process.getuid?.()!==0)throw new Error('Root required');
  const root=fileURLToPath(new URL('../',import.meta.url));
  await protectedPath(root);
  async function walk(file) {
    const st=await fs.lstat(file);
    if(st.isSymbolicLink() || st.uid!==0 || (st.mode&0o022))throw new Error('Package must be root-owned and not writable by other users');
    if(st.isDirectory())for(const entry of await fs.readdir(file))await walk(path.join(file,entry));
  }
  for(const name of ['src','shared','native','runtime','packaging','package.json'])await walk(path.join(root,name));
  await walk(configFile);
  const local=await readConfig(configFile);
  const expected=process.platform==='linux'?'/var/lib/cyberorbit':'/Library/Application Support/CYBERORBIT';
  if(local.dataDirectory!==expected)throw new Error('Custom data paths require reviewed service and uninstall overrides');
  await protectedPath(local.dataDirectory);
  const secrets=await new CredentialStore(local.dataDirectory).load();
  if(local.desktopIdentity!==secrets.mappedIdentity || !/^uid:[1-9]\d*$/.test(secrets.mappedIdentity || ''))throw new Error('Verified enrollment UID required');
  const st=await fs.lstat(local.helperCapabilityFile);
  if(st.isSymbolicLink() || !st.isFile() || st.uid!==Number(secrets.mappedIdentity.slice(4)) || (st.mode&0o077))throw new Error('Desktop capability permissions invalid');
  const grant=JSON.parse(await fs.readFile(local.helperCapabilityFile,'utf8'));
  if(grant.identity!==secrets.mappedIdentity || grant.key!==secrets.helperKey)throw new Error('Desktop capability differs from enrollment');
  // Only a boolean is printed for the installer's systemd sandbox configuration.
  return local.unixAccountControl?.enabled===true;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))checkInstall(process.argv[2]).then(value=>console.log(value?'account-control':'monitor-only')).catch(()=>{console.error('Install preflight failed: check root ownership, enrollment, credential storage and desktop capability.');process.exitCode=1;});
