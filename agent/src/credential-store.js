import fs from 'node:fs/promises';
import path from 'node:path';
import { nativeInput, exec } from './native.js';
export class CredentialStore {
  constructor(directory) { this.directory = directory; }
  async save(value) {
    if (process.platform === 'win32') {
      const encrypted = await nativeInput('vault.ps1', { action: 'protect', value: JSON.stringify(value) });
      await fs.writeFile(path.join(this.directory,'credential.dpapi.tmp'), encrypted, { mode: 0o600 });
      await fs.rename(path.join(this.directory,'credential.dpapi.tmp'), path.join(this.directory,'credential.dpapi'));
    } else if (process.platform === 'darwin') {
      await nativeInput('keychain', { action: 'set', account: this.directory, value: JSON.stringify(value) });
    } else {
      // Requires a Secret Service unlocked for the service identity. No plaintext fallback.
      const { spawn } = await import('node:child_process');
      await new Promise((resolve,reject) => {
        const p = spawn('secret-tool', ['store','--label=CYBERORBIT endpoint','application','cyberorbit','account',this.directory], { stdio: ['pipe','ignore','ignore'] });
        const timer = setTimeout(() => p.kill(), 15000);
        p.on('error', () => { clearTimeout(timer); reject(new Error('Secret Service unavailable')); });
        p.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Secret Service unavailable')); });
        p.stdin.on('error', () => {}); p.stdin.end(JSON.stringify(value));
      });
    }
  }
  async load() {
    if (process.platform === 'win32') return JSON.parse(await nativeInput('vault.ps1', { action: 'unprotect', value: await fs.readFile(path.join(this.directory,'credential.dpapi'),'utf8') }));
    if (process.platform === 'darwin') return JSON.parse(await nativeInput('keychain', { action: 'get', account: this.directory }));
    const { stdout } = await exec('secret-tool', ['lookup','application','cyberorbit','account',this.directory], { timeout: 15000, maxBuffer: 65536 });
    return JSON.parse(stdout);
  }
}
