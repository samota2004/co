import fs from 'node:fs/promises';
import path from 'node:path';
import { validateConfig } from '../shared/contract.js';
import {assertUserConfig} from './macos-user.js';
export function validateServerUrl(value, allowLoopbackHttp = false) {
  const u = new URL(value);
  if (u.username || u.password || u.search || u.hash || u.pathname !== '/') throw new Error('Server URL must be an origin');
  if (u.protocol !== 'https:' && !(allowLoopbackHttp === true && u.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(u.hostname))) throw new Error('HTTPS required (explicit loopback development exception only)');
  return u.origin;
}
export async function readConfig(file) {
  const c = JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
  c.serverUrl = validateServerUrl(c.serverUrl, c.allowLoopbackHttp);
  if (!path.isAbsolute(c.dataDirectory)) throw new Error('Absolute data directory required');
  if (!Array.isArray(c.locallyApprovedDirectories) || c.locallyApprovedDirectories.some(p => !path.isAbsolute(p))) throw new Error('Absolute locally approved directories required');
  if(c.installMode==='user') assertUserConfig(c);
  return c;
}
export function effectiveConfig(remote, local) {
  const c = validateConfig(remote);
  c.browserTitles = c.browserTitles && local.browserTitles === true;
  if(local.installMode==='user') { c.paused ||= local.paused===true; c.usb=false; c.network=false; }
  c.approvedDirectories = c.approvedDirectories.filter(p => local.locallyApprovedDirectories.some(a => path.resolve(a) === path.resolve(p)));
  return c;
}
