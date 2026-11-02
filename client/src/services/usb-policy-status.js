const ALLOW = Object.freeze({ storage: 'ALLOW', portable: 'ALLOW', optical: 'ALLOW' });

// Server command acknowledgements prove only that the agent handled a command.
// Registry readback is not independent proof of device access behavior.
export function usbPolicyDisplayState(command, desired = ALLOW, now = Date.now()) {
  if (!command) return 'UNVERIFIED';
  if (command.status === 'PENDING' || command.status === 'PENDING_OFFLINE') {
    if (command.expiresAt && Number.isFinite(Date.parse(command.expiresAt)) && Date.parse(command.expiresAt) <= now) return 'POLICY_FAILED';
    return Object.values(desired || {}).includes('BLOCK') ? 'BLOCK_PENDING' : 'ALLOW_PENDING';
  }
  if (command.status === 'UNVERIFIED' || command.resultCode === 'POLICY_APPLIED_UNVERIFIED' || command.resultCode === 'POLICY_UNVERIFIED') return 'UNVERIFIED';
  if (['FAILED','EXPIRED','SUPERSEDED'].includes(command.status) || command.resultCode === 'POLICY_FAILED') return 'POLICY_FAILED';
  if (command.status === 'UNSUPPORTED' || command.resultCode === 'POLICY_UNSUPPORTED') return 'UNSUPPORTED';
  // These states are reserved for an independently authenticated Windows
  // access-verification report. Current agent reports cannot produce them.
  if (command.status === 'VERIFIED' && command.resultCode === 'DEVICE_ACCESS_BLOCKED_VERIFIED') return 'BLOCKED';
  if (command.status === 'VERIFIED' && command.resultCode === 'DEVICE_ACCESS_ALLOWED_VERIFIED') return 'ALLOW';
  return 'UNVERIFIED';
}

export function usbPolicyStatusDetail(command, now = Date.now()) {
  if (!command) return 'No policy command has been acknowledged. The configured default is ALLOW; device access has not been independently verified.';
  if (command.status === 'EXPIRED' || (command.expiresAt && Date.parse(command.expiresAt) <= now && ['PENDING','PENDING_OFFLINE'].includes(command.status))) return 'The command expired before a current endpoint application report arrived; submit the policy again when the device is online.';
  if (command.status === 'SUPERSEDED') return 'A newer administrator policy replaced this command before confirmation.';
  if (command.status === 'PENDING_OFFLINE') return 'Device is offline; the authenticated policy will be delivered on a later heartbeat.';
  if (command.status === 'PENDING') return 'Waiting for authenticated endpoint application and report.';
  if (command.status === 'UNSUPPORTED' || command.resultCode === 'POLICY_UNSUPPORTED') return 'This Windows edition/build is outside the helper’s supported policy target.';
  if (command.status === 'FAILED' || command.resultCode === 'POLICY_FAILED') return 'Policy application failed or conflicts with a Windows-managed policy; review endpoint and Group Policy configuration.';
  if (command.status === 'VERIFIED' && command.resultCode === 'DEVICE_ACCESS_BLOCKED_VERIFIED') return 'A separate endpoint access test confirmed blocked access.';
  if (command.status === 'VERIFIED' && command.resultCode === 'DEVICE_ACCESS_ALLOWED_VERIFIED') return 'A separate endpoint access test confirmed allowed access.';
  return 'The endpoint reported policy registry configuration. Effective access to USB devices remains UNVERIFIED until a separate test under a standard employee account succeeds.';
}
