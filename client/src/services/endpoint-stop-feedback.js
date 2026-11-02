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
  const health=device?.health||{};
  const reported=health.monitoringState||(health.administrativeState==='ADMIN_STOPPED'?'PAUSED_BY_ADMIN':'UNKNOWN');
  const lastHeartbeatAt=device?.lastHeartbeatAt||health.lastHeartbeatAt||(device?.platform==='win32'?null:device?.lastSeen);
  const heartbeatTime=Date.parse(lastHeartbeatAt||'');
  const heartbeatAge=Number.isFinite(heartbeatTime)?Math.max(0,now-heartbeatTime):null;
  const telemetryState=heartbeatAge===null?'UNKNOWN':heartbeatAge<=90000?'RECEIVING':heartbeatAge<=300000?'STALE':'NOT_RECEIVING';
  const fresh=telemetryState==='RECEIVING';
  const rawControl=fresh?health.serviceControlState||'UNKNOWN':'UNKNOWN';
  const control=rawControl==='UNVERIFIED'?'UNKNOWN':rawControl;
  const command=(device?.enforcementCommands||[]).find(item=>['STOP_AGENT','START_AGENT'].includes(item.action));
  const commandStatus=command&&['PENDING','PENDING_OFFLINE'].includes(command.status)&&Date.parse(command.expiresAt||'')<=now?'EXPIRED':command?.status||'NONE';
  const monitoringState=fresh?reported:'UNKNOWN';
  const serviceState=control;
  const lastApplicationActivityAt=device?.lastApplicationActivityAt||null;
  const actionPrefix=command?.action==='START_AGENT'?'START':'STOP';
  const state=['PENDING','PENDING_OFFLINE'].includes(commandStatus)?`${actionPrefix}_PENDING`:['FAILED','UNSUPPORTED','EXPIRED'].includes(commandStatus)?`${actionPrefix}_FAILED`:monitoringState==='PAUSED_BY_ADMIN'?'ADMIN_STOPPED':monitoringState==='ACTIVE'?'RUNNING':monitoringState;
  let detail;
  if(telemetryState==='UNKNOWN')detail='No authenticated heartbeat has reported lifecycle state yet.';
  else if(telemetryState==='NOT_RECEIVING')detail=`No heartbeat for ${Math.floor(heartbeatAge/1000)} seconds; the last reported state is historical, not current.`;
  else if(telemetryState==='STALE')detail=`Heartbeat is stale (${Math.floor(heartbeatAge/1000)} seconds old); reported lifecycle values are not current.`;
  else if(monitoringState==='PAUSED_BY_ADMIN')detail=`Monitoring is paused by administrator policy (${health.pauseReason||'administrator pause'}).`;
  else if(monitoringState==='PAUSED_LOCALLY')detail='Monitoring is paused by local configuration; administrator policy remains unchanged.';
  else if(monitoringState==='RESUMING')detail='The agent accepted resume and is restarting authorized collectors; active monitoring is not confirmed yet.';
  else if(monitoringState==='ACTIVE')detail='Monitoring collectors are active according to the latest authenticated state report.';
  else detail='The latest authenticated heartbeat did not confirm a monitoring state.';
  const lastCommand=command?{action:command.action,status:commandStatus,resultCode:command.resultCode||null,createdAt:command.createdAt||null,acknowledgedAt:command.acknowledgedAt||null}:null;
  return {state,detail,serviceState,reportedServiceState:health.serviceControlState||'UNKNOWN',monitoringState,reportedMonitoringState:reported,telemetryState,lastHeartbeatAt:Number.isFinite(heartbeatTime)?new Date(heartbeatTime).toISOString():null,heartbeatAgeSeconds:heartbeatAge===null?null:Math.floor(heartbeatAge/1000),lastApplicationActivityAt,lastLifecycleCommand:lastCommand,commandAcknowledgement:commandStatus==='ACKNOWLEDGED'?'ACKNOWLEDGED':commandStatus};
}
