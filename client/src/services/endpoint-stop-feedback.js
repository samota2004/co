const lifecycleAction = command => command?.action === 'START_AGENT' ? 'resume' : 'stop';

export function stopCommandSuccess(command) {
  const action=lifecycleAction(command), label=action==='resume'?'Resume':'Stop';
  if (!command || typeof command.commandId !== 'string' || !Number.isFinite(Date.parse(command.expiresAt))) {
    return { kind: 'error', message: `The server response did not include a valid ${action} command and expiry. Refresh the device list before retrying.` };
  }
  if (['PENDING', 'PENDING_OFFLINE'].includes(command.status) && Date.parse(command.expiresAt) <= Date.now()) {
    return { kind: 'error', message: `The ${action} command expired before delivery. Confirm the device is online, then request a new command.` };
  }
  const expiry = new Date(command.expiresAt).toLocaleString();
  if (command.status === 'PENDING_OFFLINE') {
    return { kind: 'success', message: `${label} command queued while the device is offline. It will be delivered only if the agent checks in before ${expiry}.` };
  }
  if (command.status === 'PENDING') {
    return { kind: 'success', message: `${label} command recorded and waiting for the agent heartbeat. Expires ${expiry}.` };
  }
  if (command.status === 'ACKNOWLEDGED') {
    return { kind: 'success', message: `The agent acknowledged the ${action} command. The latest agent-reported monitoring state and SCM state are shown separately. Expires ${expiry}.` };
  }
  if (command.status === 'EXPIRED') {
    return { kind: 'error', message: `The ${action} command expired without authenticated agent confirmation. Confirm the device is online, then retry.` };
  }
  return { kind: 'error', message: `The server returned an unexpected ${action} command status${command.status ? ` (${command.status})` : ''}. Refresh the device list before retrying.` };
}

export function stopCommandError(error) {
  const code = error?.code;
  const status = Number(error?.status);
  if (code === 'FRESH_MFA_REQUIRED') return 'Recent administrator MFA is required. Complete MFA again, then retry this action.';
  if (code === 'AGENT_ACTION_REASON_REQUIRED') return 'The reason must contain 8–500 characters. Enter a valid audit reason and retry.';
  if (status === 401 || code === 'UNAUTHORIZED') return 'Your administrator session has expired. Sign in again, complete MFA, and retry.';
  if (status === 403 || code === 'FORBIDDEN') return 'Request denied. This action requires an active Security Administrator session with recent MFA.';
  if (status === 404) return 'The enrolled device was not found in your company scope. Refresh the device list and verify its assignment.';
  if (status === 409 || code === 'AGENT_STOP_UNSUPPORTED' || code === 'AGENT_START_UNSUPPORTED') return error?.message || 'This device cannot accept a Windows service lifecycle command. Verify enrollment and the Windows identity mapping.';
  if (code === 'ENDPOINT_DATABASE_UNAVAILABLE' || status === 503) return 'The server could not save the request. Check the backend/database and required Prisma migration, then retry.';
  if (status >= 500) return 'The server failed to process the request. No success is confirmed; check backend logs before retrying.';
  if (error?.message === 'Cannot reach the backend. Check your connection and try again.') return 'Cannot reach the backend. No command was confirmed; check your connection and retry.';
  return error?.message || 'The request was not confirmed. Refresh the device list and check authorization before retrying.';
}

export function stopCommandStatus(command, now = Date.now()) {
  const action=lifecycleAction(command), label=action==='resume'?'Resume':'Stop';
  if (['PENDING', 'PENDING_OFFLINE'].includes(command?.status) && command.expiresAt && Date.parse(command.expiresAt) <= now) return 'Expired — command passed its expiry time.';
  if (command?.status === 'PENDING_OFFLINE') return 'Pending — device offline; waiting for agent check-in.';
  if (command?.status === 'PENDING') return 'Pending — waiting for authenticated agent heartbeat.';
  if (command?.status === 'ACKNOWLEDGED') return `Acknowledged — agent accepted the ${action} command; see reported state below.`;
  if (command?.status === 'EXPIRED') return 'Expired — the agent did not acknowledge before command expiry.';
  if (command?.status === 'FAILED') return `${label} failed — endpoint did not confirm the requested state.`;
  return String(command?.status || 'Unknown').replaceAll('_', ' ');
}

export function endpointLifecycleStatus(device, now=Date.now()) {
  const reported=device?.health?.administrativeState;
  const control=device?.health?.serviceControlState;
  const command=(device?.enforcementCommands||[]).find(item=>['STOP_AGENT','START_AGENT'].includes(item.action));
  if(command){
    const prefix=command.action==='START_AGENT'?'START':'STOP';
    if(['PENDING','PENDING_OFFLINE'].includes(command.status)&&Date.parse(command.expiresAt)>now)return{state:`${prefix}_PENDING`,detail:command.status==='PENDING_OFFLINE'?'Waiting for this offline device to check in.':'Waiting for authenticated agent confirmation.'};
    if(['FAILED','UNSUPPORTED','EXPIRED'].includes(command.status))return{state:`${prefix}_FAILED`,detail:command.resultCode||'The endpoint did not confirm the requested state.'};
  }
  const lastSeen=Date.parse(device?.lastSeen||'');
  if(!Number.isFinite(lastSeen)||now-lastSeen>5*60*1000)return{state:'UNVERIFIED',detail:`The latest endpoint heartbeat is missing or stale${reported?`; last reported monitoring state: ${reported}`:''}.`};
  if(reported==='ADMIN_STOPPED')return{state:'ADMIN_STOPPED',detail:`Monitoring is persistently stopped by an administrator. Windows SCM: ${control||'UNVERIFIED'}.`};
  if(reported==='RUNNING')return{state:'RUNNING',detail:`Monitoring is reported active. Windows SCM: ${control||'UNVERIFIED'}.`};
  return{state:'UNVERIFIED',detail:'The latest authenticated heartbeat has not reported the administrative and Windows service states.'};
}
