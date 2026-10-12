import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { CredentialStore } from './credential-store.js';
import { Transport } from './uploader.js';
import { AGENT_VERSION, validateEnrollment, validateConfig } from '../shared/contract.js';
export function createEnrollmentRequest(token, platform = process.platform) {
  return validateEnrollment({ token: typeof token === 'string' ? token.trim() : token, platform, agentVersion: AGENT_VERSION });
}
export async function enroll(config, token) {
  const store = new CredentialStore(config.dataDirectory);
  // Preserve credentials, partial writes, enrollment markers and orphaned queues.
  try {
    if ((await fs.readdir(config.dataDirectory)).length) throw new Error('Already enrolled or incomplete local data exists; preserve it and review the dashboard before revocation/uninstall and reassignment.');
  } catch(e) { if(e.code!=='ENOENT')throw e; }
  // Local validation catches a pasted label, JSON, quote or truncated token
  // before sending it. The wire schema is shared with backend validation.
  const r = await new Transport(config).post('enroll', createEnrollmentRequest(token));
  try {
    if (!/^[0-9a-f-]{36}$/i.test(r.deviceId) || !/^[A-Za-z0-9_-]{43}$/.test(r.credential) || (r.mappedIdentity !== null && (typeof r.mappedIdentity !== 'string' || !(process.platform === 'win32' ? /^S-1-5-(\d+-)*\d+$/ : /^uid:\d+$/).test(r.mappedIdentity)))) throw new Error();
    validateConfig(r.config);
    if(process.platform!=='win32' && config.desktopIdentity && r.mappedIdentity!==config.desktopIdentity)throw new Error('Enrollment identity differs from local desktop configuration');
  } catch {
    throw new Error('Backend accepted enrollment but returned an invalid response. Do not reuse the token. Review the device in the dashboard; revoke an enrolled record before a new assignment.');
  }
  let phase = 'credential storage';
  try {
    await fs.mkdir(config.dataDirectory,{recursive:true,mode:0o700});
    const secrets = { deviceId:r.deviceId, credential:r.credential, queueKey:randomBytes(32).toString('base64'), helperKey:randomBytes(32).toString('base64'), mappedIdentity:r.mappedIdentity };
    await store.save(secrets);
    phase = 'local enrollment state';
    await fs.writeFile(path.join(config.dataDirectory,'enrollment-marker'),r.deviceId,{mode:0o600});
    await fs.writeFile(path.join(config.dataDirectory,'collector-config.json'),JSON.stringify(r.config),{mode:0o600});
    phase = 'desktop capability storage';
    if (process.platform === 'win32' && secrets.mappedIdentity) {
      const { nativeInput } = await import('./native.js');
      const blob = await nativeInput('vault.ps1',{action:'protect',value:JSON.stringify({key:secrets.helperKey,identity:secrets.mappedIdentity})});
      await fs.writeFile(path.join(config.dataDirectory,'helper.dpapi'),blob,{mode:0o600});
    } else if (secrets.mappedIdentity) {
      const grantFile=config.helperCapabilityFile || path.join(config.dataDirectory,'helper-capability.json');
      await fs.writeFile(grantFile,JSON.stringify({key:secrets.helperKey,identity:secrets.mappedIdentity}),{mode:0o400});
      await fs.chown(grantFile,Number(secrets.mappedIdentity.slice(4)),0);
    }
  } catch {
    throw new Error(`Enrollment accepted for device ${r.deviceId}, but ${phase} failed. Preserve local data and review the dashboard. Do not reuse the token; revoke the enrolled record before creating a new assignment.`);
  }
  // Public enrollment result only; the returned credential is never printed.
  return { deviceId:r.deviceId, mappedIdentity:r.mappedIdentity };
}
