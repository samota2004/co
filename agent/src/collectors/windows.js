import { nativeInput } from '../native.js';
export async function snapshot(config) {
  return JSON.parse(await nativeInput('windows-snapshot.ps1',config));
}
