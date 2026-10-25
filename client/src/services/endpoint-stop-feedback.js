export function stopCommandSuccess(command) {
  if (!command || typeof command.commandId !== 'string' || !Number.isFinite(Date.parse(command.expiresAt))) {
    return { kind: 'error', message: 'The server response did not include a valid stop command and expiry. Refresh the device list before retrying.' };
  }
  if (['PENDING', 'PENDING_OFFLINE'].includes(command.status) && Date.parse(command.expiresAt) <= Date.now()) {
    return { kind: 'error', message: 'The stop command has expired and was not delivered. Confirm the device is online, then request a new command.' };
  }
  const expiry = new Date(command.expiresAt).toLocaleString();
  if (command.status === 'PENDING_OFFLINE') {
    return { kind: 'success', message: `Stop command queued while the device is offline. It will be delivered only if the agent checks in before ${expiry}.` };
  }
  if (command.status === 'PENDING') {
    return { kind: 'success', message: `Stop command recorded and waiting for the agent heartbeat. Expires ${expiry}.` };
  }
  if (command.status === 'ACKNOWLEDGED') {
    return { kind: 'success', message: `The agent acknowledged the stop command. This acknowledgement is not an independent Windows service status check. Expires ${expiry}.` };
  }
  if (command.status === 'EXPIRED') {
    return { kind: 'error', message: 'The stop command has expired and was not delivered. Confirm the device is online, then request a new command.' };
  }
  return { kind: 'error', message: `The server returned an unexpected stop command status${command.status ? ` (${command.status})` : ''}. Refresh the device list before retrying.` };
}

export function stopCommandError(error) {
  const code = error?.code;
  const status = Number(error?.status);
  if (code === 'FRESH_MFA_REQUIRED') return 'Recent administrator MFA is required. Complete MFA again, then retry this action.';
  if (code === 'AGENT_ACTION_REASON_REQUIRED') return 'The reason must contain 8–500 characters. Enter a valid audit reason and retry.';
  if (status === 401 || code === 'UNAUTHORIZED') return 'Your administrator session has expired. Sign in again, complete MFA, and retry.';
  if (status === 403 || code === 'FORBIDDEN') return 'Request denied. This action requires an active Security Administrator session with recent MFA.';
  if (status === 404) return 'The enrolled device was not found in your company scope. Refresh the device list and verify its assignment.';
  if (status === 409 || code === 'AGENT_STOP_UNSUPPORTED') return error?.message || 'This device cannot accept a Windows service stop command. Verify enrollment and the Windows identity mapping.';
  if (code === 'ENDPOINT_DATABASE_UNAVAILABLE' || status === 503) return 'The server could not save the stop request. Check the backend/database and required Prisma migration, then retry.';
  if (status >= 500) return 'The server failed to process the stop request. No success is confirmed; check the backend logs before retrying.';
  if (error?.message === 'Cannot reach the backend. Check your connection and try again.') return 'Cannot reach the backend. No stop command was confirmed; check your connection and retry.';
  return error?.message || 'The stop request was not confirmed. Refresh the device list and check authorization before retrying.';
}

export function stopCommandStatus(command, now = Date.now()) {
  if (['PENDING', 'PENDING_OFFLINE'].includes(command?.status) && command.expiresAt && Date.parse(command.expiresAt) <= now) return 'Expired — the command passed its expiry time.';
  if (command?.status === 'PENDING_OFFLINE') return 'Pending — device offline; waiting for the agent to check in.';
  if (command?.status === 'PENDING') return 'Pending — waiting for authenticated agent heartbeat.';
  if (command?.status === 'ACKNOWLEDGED') return 'Acknowledged by agent — Windows service state is not independently verified.';
  if (command?.status === 'EXPIRED') return 'Expired — the agent did not acknowledge before command expiry.';
  return String(command?.status || 'Unknown').replaceAll('_', ' ');
}
