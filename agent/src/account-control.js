import path from 'node:path';
import { nativeInput } from './native.js';
import { applyUnixAccountControl } from './unix-account-control.js';

// Only fresh authenticated heartbeat responses drive OS changes. Never replay
// cached collector settings, queued events, or agent-provided employee IDs.
export async function reconcileAccountControl(local, secrets, command, run = nativeInput, platform = process.platform) {
  const windows = platform === 'win32';
  const policy = windows ? local.windowsAccountControl : local.unixAccountControl;
  if (policy?.enabled !== true) return 'disabled: local OS account control not approved';
  if (!['win32','linux','darwin'].includes(platform)) return 'refused: unsupported OS';
  const sid = windows ? /^S-1-5-21-\d+-\d+-\d+-\d+$/ : /^uid:\d+$/;
  const employee = windows ? policy.employeeSid : policy.employeeIdentity;
  const recovery = windows ? policy.recoveryAdminSid : policy.recoveryAdminIdentity;
  if (!sid.test(employee || '') || !sid.test(recovery || '') ||
      employee === recovery || employee !== secrets.mappedIdentity ||
      policy.recoveryLoginVerified !== true) return 'refused: verify employee OS identity and separate recovery administrator';
  if (!command || command.deviceId !== secrets.deviceId || command.identity !== secrets.mappedIdentity ||
      !['ALLOW','BLOCK','HOLD'].includes(command.action) ||
      !Number.isFinite(Date.parse(command.issuedAt)) || Math.abs(Date.now()-Date.parse(command.issuedAt)) > 60000) {
    return 'refused: missing, stale or mismatched account instruction';
  }
  if (command.action === 'HOLD') return 'unchanged: account state requires administrator review';
  try {
    const result = windows ? JSON.parse(await run('windows-account-control.ps1', {
      action: command.action, employeeSid: policy.employeeSid, recoveryAdminSid: policy.recoveryAdminSid,
      deviceId: secrets.deviceId, stateDirectory: path.resolve(local.dataDirectory)
    })) : await applyUnixAccountControl({action:command.action,employeeIdentity:employee,recoveryAdminIdentity:recovery,
      deviceId:secrets.deviceId,stateDirectory:path.resolve(local.dataDirectory)}, {platform});
    const codes = new Set(['ALLOWED','BLOCKED','LOGOFF_PENDING','EXTERNALLY_DISABLED','RECOVERY_REQUIRED',
      'UNSAFE_ACCOUNT','UNSAFE_RECOVERY','UNSUPPORTED_MACHINE','UNSAFE_STORAGE','ACCESS_DENIED','NATIVE_ERROR']);
    return codes.has(result.code) ? `reported: ${result.code}` : 'error: invalid native account-control response';
  } catch { return 'error: account-control helper failed; recovery administrator may be required'; }
}
