param([string]$ResultFile,[switch]$AllowSourceReparsePoint)
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run as Administrator. This updates installed code only; enrollment and data are preserved.' }
if (-not ('CyberOrbitFinalPath' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
public static class CyberOrbitFinalPath {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  private static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle, StringBuilder path, uint length, uint flags);
  public static string Resolve(string path) {
    using (SafeFileHandle handle=CreateFileW(path,0x80,0x7,IntPtr.Zero,3,0x02000000,IntPtr.Zero)) {
      if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not resolve source path.");
      StringBuilder buffer=new StringBuilder(512);
      uint length=GetFinalPathNameByHandleW(handle,buffer,(uint)buffer.Capacity,0);
      if (length==0) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not resolve source path.");
      if (length>=buffer.Capacity) {
        buffer=new StringBuilder((int)length+1);
        length=GetFinalPathNameByHandleW(handle,buffer,(uint)buffer.Capacity,0);
        if (length==0 || length>=buffer.Capacity) throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not resolve source path.");
      }
      string resolved=buffer.ToString();
      if (resolved.StartsWith(@"\\?\UNC\",StringComparison.OrdinalIgnoreCase)) resolved=@"\\"+resolved.Substring(8);
      else if (resolved.StartsWith(@"\\?\",StringComparison.OrdinalIgnoreCase)) resolved=resolved.Substring(4);
      return Path.GetFullPath(resolved);
    }
  }
}
'@
}
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$installRoot = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'CYBERORBIT'))
$dataRoot = [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'CYBERORBIT'))
foreach ($root in @($installRoot,$dataRoot)) {
  if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point root; refusing update' }
}
$sourceRootResolved = [CyberOrbitFinalPath]::Resolve($packageRoot).TrimEnd('\')
$sourceRootItem = Get-Item -LiteralPath $packageRoot -Force
if (($sourceRootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -and -not $AllowSourceReparsePoint) {
  throw 'Source package root is a reparse point. Re-run with -AllowSourceReparsePoint only after verifying this repository path.'
}
function Resolve-ValidatedSource([string]$RelativePath) {
  if ([IO.Path]::IsPathRooted($RelativePath)) { throw 'Update source paths must be relative to the package root.' }
  $candidate = [IO.Path]::GetFullPath((Join-Path $packageRoot $RelativePath))
  $lexicalRoot = $packageRoot.TrimEnd('\') + '\'
  if (-not $candidate.StartsWith($lexicalRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Update source escapes the intended package root.' }
  $sourcePrefix = $sourceRootResolved.TrimEnd('\') + '\'
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Missing update source: $RelativePath" }
  $resolved = [CyberOrbitFinalPath]::Resolve($candidate)
  if (-not $resolved.StartsWith($sourcePrefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Resolved update source escapes the intended package root.' }
  return $resolved
}
function Assert-SafeDestination([string]$RelativePath) {
  $parts = $RelativePath -split '[\\/]'
  $current = $installRoot
  for ($index=0; $index -lt $parts.Count; $index++) {
    $current = Join-Path $current $parts[$index]
    if ($index -lt ($parts.Count - 1)) {
      if (-not (Test-Path -LiteralPath $current -PathType Container)) { throw 'Installed update destination folder is missing.' }
    }
    if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'Reparse point in installed update destination; refusing update.'
    }
  }
}
$service = Get-CimInstance Win32_Service -Filter "Name='CyberOrbitAgent'"
if (-not $service -or $service.StartName -notin @('LocalSystem','NT AUTHORITY\SYSTEM')) { throw 'Expected installed CyberOrbitAgent LocalSystem service' }
$configFile = Join-Path $installRoot 'agent-config.json'
Assert-SafeDestination 'agent-config.json'
if (-not (Test-Path -LiteralPath $configFile -PathType Leaf) -or ((Get-Item -LiteralPath $configFile -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Missing or reparse-point installed configuration; refusing update' }
$expectedCommand = '"'+(Join-Path $installRoot 'CyberOrbitService.exe')+'" "'+$configFile+'"'
if ($service.PathName -ne $expectedCommand) { throw 'Unexpected service binary/configuration path; refusing update' }
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if ([IO.Path]::GetFullPath($config.dataDirectory) -ne $dataRoot) { throw 'Unexpected data path; refusing update' }
foreach ($entry in (Get-ChildItem -LiteralPath $dataRoot -Recurse -Force -ErrorAction Stop)) {
  if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point inside protected agent data; refusing update' }
}
$relativeFiles = @(
  # Explicit runtime closure for cli.js, service.js, config.js and desktop-helper.js.
  'src/account-control.js','src/browser-privacy.js','src/cli.js',
  'src/collectors/files.js','src/collectors/index.js','src/collectors/linux.js','src/collectors/macos.js','src/collectors/windows.js',
  'src/config.js','src/credential-store.js','src/desktop-control.js','src/desktop-helper.js','src/desktop-usage.js','src/enrollment.js',
  'src/health.js','src/ipc.js','src/linux-credentials.js','src/macos-user.js','src/native.js','src/normalizer.js',
  'src/queue.js','src/remote-stop.js','src/service.js','src/unix-account-control.js','src/unix-desktop-supervisor.js',
  'src/uploader.js','src/user-desktop-supervisor.js','src/user-lock.js','src/user-revocation.js',
  # Explicit Windows support files used by the updater, service and desktop helper.
  'src/windows-service-diagnostic.js','shared/contract.js','shared/app-identity.js',
  'native/windows-api.cs','native/vault.ps1','native/windows-snapshot.ps1','native/windows-desktop.ps1','native/windows-account-control.ps1',
  'packaging/windows/configure-browser-titles.ps1','packaging/windows/configure-startup.ps1',
  'packaging/windows/desktop-watchdog.ps1','packaging/windows/uninstall.ps1',
  'packaging/windows/update-source-files.ps1','package.json'
)
$updateSources=@{}
foreach ($relative in $relativeFiles) {
  $source = Resolve-ValidatedSource $relative
  $target = Join-Path $installRoot $relative
  Assert-SafeDestination $relative
  $updateSources[$relative]=$source
}
$updateTransactionHelper=Resolve-ValidatedSource 'packaging/windows/update-source-files.ps1'
. $updateTransactionHelper
$hostSource=Resolve-ValidatedSource 'packaging/windows/ServiceHost.cs'
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if(-not(Test-Path -LiteralPath $hostSource) -or -not(Test-Path -LiteralPath $compiler)){throw 'Service host source/compiler is unavailable; no installed files changed'}
$hostTarget=Join-Path $installRoot 'CyberOrbitService.exe'
Assert-SafeDestination 'CyberOrbitService.exe'
if(-not(Test-Path -LiteralPath $hostTarget)){throw 'Installed service host is missing; refusing an incomplete in-place update'}
if((Get-Item -LiteralPath $hostTarget).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point service host; refusing update'}
$credentialFile = Join-Path $dataRoot 'credential.dpapi'
if (-not (Test-Path -LiteralPath $credentialFile)) { throw 'No existing protected credentials; update cannot enroll or replace them' }
$runtimeNode = Join-Path $installRoot 'runtime/node.exe'
Assert-SafeDestination 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $runtimeNode -PathType Leaf) -or ((Get-Item -LiteralPath $runtimeNode -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Missing or reparse-point installed runtime; refusing update' }
$taskName = 'CYBERORBIT Repair Probe '+[Guid]::NewGuid().ToString('N')
$desktopTaskName = 'CYBERORBIT Desktop Monitor'
$desktopTask = Get-ScheduledTask -TaskName $desktopTaskName -ErrorAction SilentlyContinue
$restartService = $service.State -eq 'Running'
$serviceWasDisabled = $service.StartMode -eq 'Disabled'
if ($serviceWasDisabled -and $restartService) { throw 'Service is disabled but still running; stop/review it explicitly before updating.' }
$restartDesktopTask = $null -ne $desktopTask -and $desktopTask.State -eq 'Running'
$compiledHost=$null
$compiledHost=Join-Path ([IO.Path]::GetTempPath()) ('CyberOrbitService-'+[Guid]::NewGuid().ToString('N')+'.exe')
try {
  & $compiler /nologo /target:exe "/out:$compiledHost" /reference:System.ServiceProcess.dll $hostSource
  if($LASTEXITCODE -ne 0 -or -not(Test-Path -LiteralPath $compiledHost)){throw 'Service host compile failed; no installed files changed'}
  $updateSources['CyberOrbitService.exe']=$compiledHost
} catch {
  if ($compiledHost -and (Test-Path -LiteralPath $compiledHost)) { Remove-Item -LiteralPath $compiledHost -Force -ErrorAction SilentlyContinue }
  throw
}
$reportFile = Join-Path $dataRoot ('repair-diagnostic-'+[Guid]::NewGuid().ToString('N')+'.json')
$backupRoot = Join-Path $installRoot ('.code-backup-'+[Guid]::NewGuid().ToString('N'))
$sourceTransaction = @{Saved=@{};AclBefore=@{};CreatedTargets=@()}; $result = @{success=$false;stage='preflight'}
try {
  if ($restartService) {
    Stop-Service CyberOrbitAgent -ErrorAction Stop
    (Get-Service CyberOrbitAgent).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))
  }
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
  Save-CyberOrbitUpdateFiles -Sources $updateSources -InstallRoot $installRoot -BackupRoot $backupRoot -State $sourceTransaction
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
  if ($desktopTask -and -not $serviceWasDisabled -and $desktopTask.State -ne 'Disabled') {
    $result.stage='startup_configuration'
    & (Join-Path $installRoot 'packaging/windows/configure-startup.ps1') | Out-Null
    $result.automaticStartupConfigured=$true
  }
  if ($restartService) {
    $result.stage='service_start'
    Start-Service CyberOrbitAgent
    (Get-Service CyberOrbitAgent).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
  }
  if ($restartDesktopTask) {
    Start-ScheduledTask -TaskName $desktopTaskName
    $startDeadline=(Get-Date).AddSeconds(30)
    while ((Get-ScheduledTask -TaskName $desktopTaskName).State -ne 'Running' -and (Get-Date) -lt $startDeadline) { Start-Sleep -Milliseconds 250 }
    if ((Get-ScheduledTask -TaskName $desktopTaskName).State -ne 'Running') { throw 'Desktop session helper did not restart after update' }
  }
  if ($restartService) {
    for($i=0;$i -lt 20;$i++) { Start-Sleep -Seconds 2; if((Get-Service CyberOrbitAgent).Status -ne 'Running'){throw 'Service exited during startup verification'} }
  }
  $result.success=$true; $result.stage='updated'; $result.serviceStatus=[string](Get-Service CyberOrbitAgent).Status
} catch {
  # Never emit the exception object: it may contain native stdout/secret input.
  $result.error='Installed update failed during '+$result.stage+'. See diagnostic categories; original code restored when possible.'
  if ($restartService) { Stop-Service CyberOrbitAgent -ErrorAction SilentlyContinue }
  Restore-CyberOrbitUpdateFiles -State $sourceTransaction -InstallRoot $installRoot
  if ($restartService) { Start-Service CyberOrbitAgent -ErrorAction SilentlyContinue }
  if ($restartDesktopTask) { Start-ScheduledTask -TaskName $desktopTaskName -ErrorAction SilentlyContinue }
} finally {
  if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
  if ($compiledHost -and (Test-Path -LiteralPath $compiledHost)) { Remove-Item -LiteralPath $compiledHost -Force -ErrorAction SilentlyContinue }
  $json=$result | ConvertTo-Json -Depth 8
  if($ResultFile){[IO.File]::WriteAllText([IO.Path]::GetFullPath($ResultFile),$json)}
  Write-Output $json
}
if(-not $result.success){exit 1}
