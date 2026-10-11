import path from 'node:path';
import { nativeInput } from './native.js';

// Only fresh authenticated heartbeat responses drive OS changes. Never replay
// cached collector settings, queued events, or agent-provided employee IDs.
export async function reconcileAccountControl(local, secrets, command, run = nativeInput, platform = process.platform) {
  const policy = local.windowsAccountControl;
  if (policy?.enabled !== true) return 'disabled: local Windows account control not approved';
  if (platform !== 'win32') return 'refused: Windows local accounts only';
  const sid = /^S-1-5-21-\d+-\d+-\d+-\d+$/;
  if (!sid.test(policy.employeeSid || '') || !sid.test(policy.recoveryAdminSid || '') ||
      policy.employeeSid === policy.recoveryAdminSid || policy.employeeSid !== secrets.mappedIdentity ||
      policy.recoveryLoginVerified !== true) return 'refused: verify employee SID and separate recovery administrator';
  if (!command || command.deviceId !== secrets.deviceId || command.identity !== secrets.mappedIdentity ||
      !['ALLOW','BLOCK','HOLD'].includes(command.action) ||
      !Number.isFinite(Date.parse(command.issuedAt)) || Math.abs(Date.now()-Date.parse(command.issuedAt)) > 60000) {
    return 'refused: missing, stale or mismatched account instruction';
  }
  if (command.action === 'HOLD') return 'unchanged: account state requires administrator review';
  try {
    const result = JSON.parse(await run('windows-account-control.ps1', {
      action: command.action, employeeSid: policy.employeeSid, recoveryAdminSid: policy.recoveryAdminSid,
      deviceId: secrets.deviceId, stateDirectory: path.resolve(local.dataDirectory)
    }));
    const codes = new Set(['ALLOWED','BLOCKED','LOGOFF_PENDING','EXTERNALLY_DISABLED','RECOVERY_REQUIRED',
      'UNSAFE_ACCOUNT','UNSAFE_RECOVERY','UNSUPPORTED_MACHINE','UNSAFE_STORAGE','ACCESS_DENIED','NATIVE_ERROR']);
    return codes.has(result.code) ? `reported: ${result.code}` : 'error: invalid native account-control response';
  } catch { return 'error: account-control helper failed; recovery administrator may be required'; }
}
