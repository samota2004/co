import fs from 'node:fs/promises';
import path from 'node:path';
import { nativeInput, exec } from './native.js';
import { hostCredential } from './linux-credentials.js';
export class CredentialStore {
  constructor(directory) { this.directory = directory; }
  async exists() {
    if(process.platform!=='darwin')throw new Error('Keychain check is macOS only');
    return (await nativeInput('keychain',{action:'exists',account:this.directory}))==='true';
  }
  async remove() {
    if(process.platform!=='darwin') throw new Error('Keychain removal is macOS only');
    await nativeInput('keychain',{action:'delete',account:this.directory});
  }
  async save(value) {
    if (process.platform === 'win32') {
      const encrypted = await nativeInput('vault.ps1', { action: 'protect', value: JSON.stringify(value) });
      await fs.writeFile(path.join(this.directory,'credential.dpapi.tmp'), encrypted, { mode: 0o600 });
      await fs.rename(path.join(this.directory,'credential.dpapi.tmp'), path.join(this.directory,'credential.dpapi'));
    } else if (process.platform === 'darwin') {
      await nativeInput('keychain', { action: 'set', account: this.directory, value: JSON.stringify(value) });
    } else {
      const encrypted=await hostCredential('encrypt',JSON.stringify(value));
      const tmp=path.join(this.directory,'credential.host.tmp');
      await fs.writeFile(tmp,encrypted,{mode:0o600,flag:'wx'});
      await fs.rename(tmp,path.join(this.directory,'credential.host'));
    }
  }
  async load() {
    if (process.platform === 'win32') return JSON.parse(await nativeInput('vault.ps1', { action: 'unprotect', value: await fs.readFile(path.join(this.directory,'credential.dpapi'),'utf8') }));
    if (process.platform === 'darwin') return JSON.parse(await nativeInput('keychain', { action: 'get', account: this.directory }));
    try {return JSON.parse(await hostCredential('decrypt',await fs.readFile(path.join(this.directory,'credential.host'),'utf8')));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    // Read legacy enrollments without resetting their identity or queue. An
    // administrator can migrate with configure-unix.js once keyring is unlocked.
    const { stdout } = await exec('secret-tool', ['lookup','application','cyberorbit','account',this.directory], { timeout: 15000, maxBuffer: 65536 });
    return JSON.parse(stdout);
  }
}
