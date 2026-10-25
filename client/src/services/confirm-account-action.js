export function confirmAccountAction(action, targetName='this employee') {
  if (typeof window === 'undefined') return null;
  if (!window.confirm(`Confirm ${action} for ${targetName}? Active application sessions will be revoked.`)) return null;
  const reason=window.prompt(`Enter the reason for ${action} (at least 8 characters):`);
  return typeof reason==='string'&&reason.trim().length>=8?reason.trim():null;
}
