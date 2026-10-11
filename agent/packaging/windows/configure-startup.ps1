$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run as Administrator to configure CYBERORBIT automatic startup.' }
$installRoot = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'CYBERORBIT'
$service = Get-CimInstance Win32_Service -Filter "Name='CyberOrbitAgent'"
$expected = '"'+(Join-Path $installRoot 'CyberOrbitService.exe')+'" "'+(Join-Path $installRoot 'agent-config.json')+'"'
if (-not $service -or $service.StartName -notin @('LocalSystem','NT AUTHORITY\SYSTEM') -or $service.PathName -ne $expected) {
  throw 'Expected the installed CYBERORBIT LocalSystem service; no startup changes made.'
}
$desktopName = 'CYBERORBIT Desktop Monitor'
$desktop = Get-ScheduledTask -TaskName $desktopName -ErrorAction Stop
if ($desktop.State -eq 'Disabled') { throw 'Desktop task is disabled by an administrator. Enable it explicitly before configuring automatic startup.' }
if ($service.StartMode -eq 'Disabled') { throw 'Service is disabled by an administrator. Enable it explicitly before configuring automatic startup.' }
$watchdog = Join-Path $installRoot 'packaging/windows/desktop-watchdog.ps1'
foreach ($path in @($installRoot,(Join-Path $installRoot 'packaging'),(Join-Path $installRoot 'packaging/windows'))) {
  if ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected reparse point in installed code path.' }
}
if ((Test-Path -LiteralPath $watchdog) -and ((Get-Item -LiteralPath $watchdog).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unexpected watchdog reparse point.' }
$source = Join-Path $PSScriptRoot 'desktop-watchdog.ps1'
if ([IO.Path]::GetFullPath($source) -ne [IO.Path]::GetFullPath($watchdog)) {
  [IO.File]::WriteAllBytes($watchdog,[IO.File]::ReadAllBytes($source))
}
# Exact service rights: SYSTEM/admin full; ordinary users query only.
$serviceDacl = 'D:P(A;;0xF01FF;;;SY)(A;;0xF01FF;;;BA)(A;;0x2008D;;;BU)'
& sc.exe sdset CyberOrbitAgent $serviceDacl | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict service control permissions.' }
Set-Service -Name CyberOrbitAgent -StartupType Automatic
& sc.exe failure CyberOrbitAgent reset= 86400 actions= restart/10000/restart/30000/restart/60000 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not configure service recovery.' }
& sc.exe failureflag CyberOrbitAgent 1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not configure failure recovery flag.' }
$scheduler = New-Object -ComObject 'Schedule.Service'
$scheduler.Connect()
$folder = $scheduler.GetFolder('\')
$taskDacl = 'D:P(A;;GA;;;SY)(A;;GA;;;BA)'
# Do not let Task Scheduler add a control ACE for the employee principal.
$folder.GetTask($desktopName).SetSecurityDescriptor($taskDacl,16)
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$watchdog+'"')
$boot = New-ScheduledTaskTrigger -AtStartup
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 45) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery' -Action $action -Trigger @($boot,$repeat) -Principal $principal -Settings $settings -Description 'CYBERORBIT desktop monitoring recovery while the endpoint service is running. Administrators may disable this task.' -Force | Out-Null
$folder.GetTask('CYBERORBIT Desktop Recovery').SetSecurityDescriptor($taskDacl,16)
Start-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery'
Write-Output 'Automatic boot startup, service recovery and administrator-only task controls configured. Desktop helper recovery is checked every minute while the service runs.'
