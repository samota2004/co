param(
  [Parameter(Mandatory=$true)][string]$EmployeeSid,
  [Parameter(Mandatory=$true)][string]$RecoveryAdminSid,
  [switch]$Enable,
  [switch]$RecoveryLoginVerified
)
$ErrorActionPreference = 'Stop'
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run from an Administrator PowerShell terminal.' }
if ($Enable -and -not $RecoveryLoginVerified) { throw 'First test signing in to the separate recovery administrator, then pass -RecoveryLoginVerified.' }
$root = Join-Path $env:ProgramFiles 'CYBERORBIT'
$configPath = Join-Path $root 'agent-config.json'
foreach ($p in @($root,$configPath)) {
  if ((Get-Item -LiteralPath $p -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked installation refused.' }
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$helper = Join-Path $root 'native/windows-account-control.ps1'
if (-not (Test-Path -LiteralPath $helper)) { throw 'Update installed agent to 1.0.6 before configuration.' }
$request = @{action='CHECK';employeeSid=$EmployeeSid;recoveryAdminSid=$RecoveryAdminSid} | ConvertTo-Json -Compress
$reply = $request | & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper
if ($LASTEXITCODE -ne 0) { throw 'Read-only account preflight failed.' }
$result = $reply | ConvertFrom-Json
if ($result.code -ne 'READY') { throw ('Account preflight refused: '+$result.code) }
if (-not $Enable) { Write-Output 'Preflight passed. No account or configuration was changed.'; exit 0 }
if (-not $result.employeeEnabled) { throw 'Employee account is already disabled. Restore/review it locally before enabling management.' }
$config | Add-Member -NotePropertyName windowsAccountControl -NotePropertyValue @{
  enabled=$true;employeeSid=$EmployeeSid;recoveryAdminSid=$RecoveryAdminSid;recoveryLoginVerified=$true
} -Force
$original = [IO.File]::ReadAllBytes($configPath)
$acl = (Get-Acl -LiteralPath $configPath).Sddl
try {
  [IO.File]::WriteAllText($configPath,($config | ConvertTo-Json -Depth 20),(New-Object Text.UTF8Encoding($false)))
  if ((Get-Acl -LiteralPath $configPath).Sddl -ne $acl) { throw 'Configuration ACL changed.' }
} catch { [IO.File]::WriteAllBytes($configPath,$original); throw }
Write-Output 'Local approval saved. No account was disabled. Restart CyberOrbitAgent to activate; a FROZEN employee will then be signed out and disabled. Verify device mapping and save work first.'
