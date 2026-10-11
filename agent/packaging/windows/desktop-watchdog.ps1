$ErrorActionPreference = 'Stop'
# Task Scheduler runs this as SYSTEM. Never undo an administrator's service stop
# or disabled desktop task. No credentials, browser data or process arguments logged.
$service = Get-Service -Name CyberOrbitAgent -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq 'Running') {
  $task = Get-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -ErrorAction SilentlyContinue
  if ($task -and $task.State -eq 'Ready') {
    Start-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor'
  }
}
