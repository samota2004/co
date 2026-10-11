param([Parameter(Mandatory=$true)][string]$ServerUrl, [switch]$AllowLoopbackHttp, [string[]]$ApprovedDirectory=@(), [switch]$TokenFromClipboard)
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run in an elevated PowerShell prompt' }
if (Get-Service CyberOrbitAgent -ErrorAction SilentlyContinue) { throw 'Agent already installed; revoke and uninstall before reassignment' }
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$installRoot = Join-Path $env:ProgramFiles 'CYBERORBIT'
$dataRoot = Join-Path $env:ProgramData 'CYBERORBIT'
if ((Test-Path -LiteralPath $installRoot) -or (Test-Path -LiteralPath $dataRoot)) { throw 'Existing installation/data must be reviewed; refusing to overwrite' }
function Set-PrivateAcl([string]$Target) {
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach ($sid in @('S-1-5-18','S-1-5-32-544')) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Target -AclObject $acl
}
# Check clipboard input before staging files or making an enrollment request.
. (Join-Path $PSScriptRoot 'enrollment-input.ps1')
if ($TokenFromClipboard) {
  # Wait until AFTER the command is pasted, since pasting the install command
  # itself can replace the clipboard's token. Keep accidental input hidden.
  $confirmation = Read-Host 'Click Copy token in Devices now, then return here and press Enter (do not paste the token)' -AsSecureString
  $confirmation.Dispose()
}
$secureToken = Read-CyberOrbitEnrollmentToken -FromClipboard:$TokenFromClipboard
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
  $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
  New-Item -ItemType Directory -Path $installRoot,$dataRoot | Out-Null
  Set-PrivateAcl $installRoot
  Set-PrivateAcl $dataRoot
  foreach ($entry in Get-ChildItem -LiteralPath $packageRoot) { Copy-Item -LiteralPath $entry.FullName -Destination $installRoot -Recurse -Force }
  $configFile = Join-Path $installRoot 'agent-config.json'
  @{ serverUrl=$ServerUrl; allowLoopbackHttp=[bool]$AllowLoopbackHttp; dataDirectory=$dataRoot; locallyApprovedDirectories=@($ApprovedDirectory) } | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
  # PowerShell 5 writes a UTF8 BOM; Node reads BOM explicitly.
  $resultText = $plainToken | & (Join-Path $installRoot 'runtime/node.exe') (Join-Path $installRoot 'src/cli.js') enroll $configFile
  if ($LASTEXITCODE -ne 0) { throw 'Enrollment failed; no startup entries were installed. Review the sanitized agent error above and the dashboard device state. For an unenrolled device with empty local data, use reset-incomplete.ps1 before retrying.' }
  $result = $resultText | ConvertFrom-Json
} finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $plainToken=$null; $secureToken.Dispose(); $secureToken=$null }
# Users can read program binaries/config but cannot modify them.
$acl = Get-Acl -LiteralPath $installRoot
$acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-545')), 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
Set-Acl -LiteralPath $installRoot -AclObject $acl
if ($result.mappedIdentity) {
  $sid = New-Object Security.Principal.SecurityIdentifier($result.mappedIdentity)
  # Traversal only on data root. Device credential and queue inherit admin/SYSTEM only.
  $acl = Get-Acl -LiteralPath $dataRoot
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'Traverse','None','None','Allow')))
  Set-Acl -LiteralPath $dataRoot -AclObject $acl
  $helperFile = Join-Path $dataRoot 'helper.dpapi'
  $acl = Get-Acl -LiteralPath $helperFile
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid,'Read','Allow')))
  Set-Acl -LiteralPath $helperFile -AclObject $acl
  $action = New-ScheduledTaskAction -Execute (Join-Path $installRoot 'runtime/node.exe') -Argument ('"'+(Join-Path $installRoot 'src/cli.js')+'" helper "'+$configFile+'"')
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $result.mappedIdentity
  $principal = New-ScheduledTaskPrincipal -UserId $result.mappedIdentity -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -MultipleInstances Parallel -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Visible CYBERORBIT approved application usage monitor' | Out-Null
}
New-Service -Name CyberOrbitAgent -DisplayName 'CYBERORBIT Endpoint Monitor' -Description 'Visible enterprise endpoint telemetry; uploads independently of website' -BinaryPathName ('"'+(Join-Path $installRoot 'CyberOrbitService.exe')+'" "'+$configFile+'"') -StartupType Automatic | Out-Null
& sc.exe failure CyberOrbitAgent reset= 86400 actions= restart/10000/restart/30000/restart/60000 | Out-Null
if ($result.mappedIdentity) { & (Join-Path $PSScriptRoot 'configure-startup.ps1') }
Start-Service CyberOrbitAgent
Write-Output "Installed device $($result.deviceId). Session helper starts at next logon. Revoke credentials in the dashboard before uninstall/reassignment."
