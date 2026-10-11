$ErrorActionPreference = 'Stop'
# Exercise the real watchdog with OS commands mocked; never stop the live agent.
function Get-Service { param($Name,$ErrorAction) return $script:serviceFixture }
function Get-ScheduledTask { param($TaskName,$ErrorAction) return $script:taskFixture }
function Start-ScheduledTask { param($TaskName) $script:starts += 1 }
$cases = @(
  @{service='Running';task='Ready';expected=1},
  @{service='Running';task='Running';expected=0},
  @{service='Running';task='Disabled';expected=0},
  @{service='Stopped';task='Ready';expected=0},
  @{service='StopPending';task='Ready';expected=0},
  @{service=$null;task='Ready';expected=0},
  @{service='Running';task=$null;expected=0}
)
foreach ($case in $cases) {
  $script:serviceFixture = if ($case.service) { [pscustomobject]@{Status=$case.service} } else { $null }
  $script:taskFixture = if ($case.task) { [pscustomobject]@{State=$case.task} } else { $null }
  $script:starts=0
  . (Join-Path $PSScriptRoot '../packaging/windows/desktop-watchdog.ps1')
  if ($script:starts -ne $case.expected) { throw "Unexpected recovery for service=$($case.service), task=$($case.task)" }
}
Write-Output 'PASS: seven recovery cases, including administrator stop/disable and duplicate prevention.'
