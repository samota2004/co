param([string]$ResultFile)
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run as Administrator. This updates installed code only; enrollment and data are preserved.' }
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$installRoot = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'CYBERORBIT'))
$dataRoot = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'CYBERORBIT'))
$service = Get-CimInstance Win32_Service -Filter "Name='CyberOrbitAgent'"
if (-not $service -or $service.StartName -notin @('LocalSystem','NT AUTHORITY\SYSTEM')) { throw 'Expected installed CyberOrbitAgent LocalSystem service' }
$configFile = Join-Path $installRoot 'agent-config.json'
$expectedCommand = '"'+(Join-Path $installRoot 'CyberOrbitService.exe')+'" "'+$configFile+'"'
if ($service.PathName -ne $expectedCommand) { throw 'Unexpected service binary/configuration path; refusing update' }
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($config.dataDirectory) -ne $dataRoot) { throw 'Unexpected data path; refusing update' }
foreach ($root in @($installRoot,$dataRoot,$packageRoot)) {
  if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point root; refusing update' }
}
$relativeFiles = @('src/native.js','src/normalizer.js','src/config.js','src/account-control.js','packaging/windows/configure-browser-titles.ps1','src/unix-account-control.js','src/unix-desktop-supervisor.js','src/desktop-helper.js','src/service.js','src/health.js','src/windows-service-diagnostic.js','shared/contract.js','shared/app-identity.js','native/windows-api.cs','native/windows-desktop.ps1','native/windows-account-control.ps1','packaging/windows/configure-startup.ps1','packaging/windows/desktop-watchdog.ps1','packaging/windows/uninstall.ps1','package.json')
foreach ($relative in $relativeFiles) {
  $source = Join-Path $packageRoot $relative
  $target = Join-Path $installRoot $relative
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing update file: $relative" }
  if ((Get-Item -LiteralPath ([IO.Path]::GetDirectoryName($target))).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point in code path; refusing update' }
  if ((Test-Path -LiteralPath $target) -and ((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse point code file; refusing update' }
}
$credentialFile = Join-Path $dataRoot 'credential.dpapi'
if (-not (Test-Path -LiteralPath $credentialFile)) { throw 'No existing protected credentials; update cannot enroll or replace them' }
$taskName = 'CYBERORBIT Repair Probe '+[Guid]::NewGuid().ToString('N')
$desktopTaskName = 'CYBERORBIT Desktop Monitor'
$desktopTask = Get-ScheduledTask -TaskName $desktopTaskName -ErrorAction SilentlyContinue
if ($service.StartMode -eq 'Disabled' -or ($desktopTask -and $desktopTask.State -eq 'Disabled')) { throw 'Startup is disabled by an administrator. Enable it explicitly before updating.' }
$restartDesktopTask = $null -ne $desktopTask -and $desktopTask.State -eq 'Running'
$reportFile = Join-Path $dataRoot ('repair-diagnostic-'+[Guid]::NewGuid().ToString('N')+'.json')
$backupRoot = Join-Path $installRoot ('.code-backup-'+[Guid]::NewGuid().ToString('N'))
$saved = @{}; $aclBefore = @{}; $result = @{success=$false;stage='preflight'}
try {
  Stop-Service CyberOrbitAgent -ErrorAction Stop
  (Get-Service CyberOrbitAgent).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))
  if ($restartDesktopTask) {
    Stop-ScheduledTask -TaskName $desktopTaskName -ErrorAction Stop
    $stopDeadline=(Get-Date).AddSeconds(20)
    while ((Get-ScheduledTask -TaskName $desktopTaskName).State -eq 'Running' -and (Get-Date) -lt $stopDeadline) { Start-Sleep -Milliseconds 250 }
    if ((Get-ScheduledTask -TaskName $desktopTaskName).State -eq 'Running') { throw 'Desktop session helper did not stop for update' }
  }
  # Snapshot encrypted data/ACLs while the worker is stopped. Hashes stay local.
  $dataFiles = @(Get-ChildItem -LiteralPath $dataRoot -Recurse -Force -File | Where-Object { $_.Name -notlike 'service.log*' -and $_.Name -ne 'service.lock' })
  $dataHashes = @{}; $dataAcls = @{}
  foreach ($file in $dataFiles) { $dataHashes[$file.FullName]=(Get-FileHash -LiteralPath $file.FullName).Hash; $dataAcls[$file.FullName]=(Get-Acl -LiteralPath $file.FullName).Sddl }
  $rootAcls = @{}; foreach ($root in @($installRoot,$dataRoot)) { $rootAcls[$root]=(Get-Acl -LiteralPath $root).Sddl }
  New-Item -ItemType Directory -Path $backupRoot | Out-Null
  $result.stage='code_update'
  foreach ($relative in $relativeFiles) {
    $target=Join-Path $installRoot $relative
    if (Test-Path -LiteralPath $target) {
      $saved[$relative]=[IO.File]::ReadAllBytes($target); $aclBefore[$relative]=(Get-Acl -LiteralPath $target).Sddl
      $backupFile=Join-Path $backupRoot $relative
      New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($backupFile)) -Force | Out-Null
      [IO.File]::WriteAllBytes($backupFile,$saved[$relative])
    }
    # Writing existing files in place preserves their owner/DACL/inheritance.
    [IO.File]::WriteAllBytes($target,[IO.File]::ReadAllBytes((Join-Path $packageRoot $relative)))
    if ($aclBefore.ContainsKey($relative) -and (Get-Acl -LiteralPath $target).Sddl -ne $aclBefore[$relative]) { throw 'Code ACL changed unexpectedly' }
  }
  $result.stage='system_probe'
  $arguments='"'+(Join-Path $installRoot 'src/windows-service-diagnostic.js')+'" "'+$configFile+'" "'+$reportFile+'"'
  $action=New-ScheduledTaskAction -Execute (Join-Path $installRoot 'runtime/node.exe') -Argument $arguments -WorkingDirectory $installRoot
  $principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings | Out-Null
  Start-ScheduledTask -TaskName $taskName
  $deadline=(Get-Date).AddSeconds(100)
  while (-not (Test-Path -LiteralPath $reportFile)) {
    $taskInfo=Get-ScheduledTaskInfo -TaskName $taskName
    $result.probeTask=@{state=[string](Get-ScheduledTask -TaskName $taskName).State;lastResult=$taskInfo.LastTaskResult}
    if((Get-Date) -gt $deadline){throw 'LocalSystem diagnostic timed out'}
    if($taskInfo.LastRunTime -gt (Get-Date).AddMinutes(-2) -and $taskInfo.LastTaskResult -notin @(0,267009,267011)) {throw 'LocalSystem diagnostic process failed'}
    Start-Sleep -Seconds 1
  }
  $probe=Get-Content -LiteralPath $reportFile -Raw | ConvertFrom-Json
  $result.diagnostic=$probe
  if (-not $probe.context.system -or -not $probe.fixed.vault.ok -or -not $probe.fixed.snapshot.ok) { throw 'LocalSystem native preflight failed; see sanitized diagnostic categories' }
  foreach ($file in $dataFiles) {
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne $dataHashes[$file.FullName] -or (Get-Acl -LiteralPath $file.FullName).Sddl -ne $dataAcls[$file.FullName]) { throw 'Existing protected data/ACL changed unexpectedly' }
  }
  foreach ($root in @($installRoot,$dataRoot)) { if((Get-Acl -LiteralPath $root).Sddl -ne $rootAcls[$root]){throw 'Root ACL changed unexpectedly'} }
  $result.dataAndAclsPreserved=$true
  if ($desktopTask) {
    $result.stage='startup_configuration'
    & (Join-Path $installRoot 'packaging/windows/configure-startup.ps1') | Out-Null
    $result.automaticStartupConfigured=$true
  }
  $result.stage='service_start'
  Start-Service CyberOrbitAgent
  (Get-Service CyberOrbitAgent).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
  if ($restartDesktopTask) {
    Start-ScheduledTask -TaskName $desktopTaskName
    $startDeadline=(Get-Date).AddSeconds(30)
    while ((Get-ScheduledTask -TaskName $desktopTaskName).State -ne 'Running' -and (Get-Date) -lt $startDeadline) { Start-Sleep -Milliseconds 250 }
    if ((Get-ScheduledTask -TaskName $desktopTaskName).State -ne 'Running') { throw 'Desktop session helper did not restart after update' }
  }
  for($i=0;$i -lt 20;$i++) { Start-Sleep -Seconds 2; if((Get-Service CyberOrbitAgent).Status -ne 'Running'){throw 'Service exited during startup verification'} }
  $result.success=$true; $result.stage='running'; $result.serviceStatus='Running'
} catch {
  # Never emit the exception object: it may contain native stdout/secret input.
  $result.error='Installed update failed during '+$result.stage+'. See diagnostic categories; original code restored when possible.'
  Stop-Service CyberOrbitAgent -ErrorAction SilentlyContinue
  foreach ($relative in $saved.Keys) { [IO.File]::WriteAllBytes((Join-Path $installRoot $relative),$saved[$relative]) }
  if ($restartDesktopTask) { Start-ScheduledTask -TaskName $desktopTaskName -ErrorAction SilentlyContinue }
} finally {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  $json=$result | ConvertTo-Json -Depth 8
  if($ResultFile){[IO.File]::WriteAllText([IO.Path]::GetFullPath($ResultFile),$json)}
  Write-Output $json
}
if(-not $result.success){exit 1}
