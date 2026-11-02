param([switch]$PurgeData,[string]$AuthorizationGrantPath)
$ErrorActionPreference = 'Stop'
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'CYBERORBIT'))
$dataRoot = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'CYBERORBIT'))
if ($installRoot -ne 'C:\Program Files\CYBERORBIT' -and $installRoot -ne [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'CYBERORBIT'))) { throw 'Unexpected installation path' }
if ($dataRoot -ne [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'CYBERORBIT'))) { throw 'Unexpected data path' }
foreach($root in @($installRoot,$dataRoot)) { if((Test-Path -LiteralPath $root) -and ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Protected installation/data root is a reparse point; no changes made.'} }
$configFile=Join-Path $installRoot 'agent-config.json'
$node=Join-Path $installRoot 'runtime/node.exe';$cli=Join-Path $installRoot 'src/cli.js'
if(-not $AuthorizationGrantPath) {
  $reason=Read-Host 'Reason to request agent uninstallation from the Main Admin'
  & $node $cli request-uninstall $configFile $reason
  if($LASTEXITCODE -ne 0){throw 'Authorization request failed. The installed agent was not changed.'}
  Write-Output 'Request submitted. No files, credentials, queues, tasks, or service settings were changed. The Main Admin must approve it.'
  exit 0
}
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'The authorized uninstall executor must run as Windows Administrator or SYSTEM.' }
$expectedGrant=[IO.Path]::GetFullPath((Join-Path $dataRoot 'local-operation-grant.json'))
if([IO.Path]::GetFullPath($AuthorizationGrantPath) -ne $expectedGrant -or -not(Test-Path -LiteralPath $expectedGrant -PathType Leaf) -or ((Get-Item -LiteralPath $expectedGrant -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'A protected device-bound Main Admin grant is required; no changes made.'}
$grantText=& $node $cli consume-local-operation-grant $configFile AGENT_UNINSTALL
if($LASTEXITCODE -ne 0){throw 'Main Admin authorization is invalid, expired, replayed, or for another action/device; no changes made.'}
try{$grant=$grantText|ConvertFrom-Json}catch{throw 'Could not validate the authorization result; no changes made.'}
if($grant.action -ne 'AGENT_UNINSTALL' -or $grant.requestId -notmatch '^[0-9a-f-]{36}$' -or $grant.nonce -notmatch '^[0-9a-f-]{36}$'){throw 'Authorization is not valid for uninstallation; no changes made.'}
# The signed grant is validated and locally marked single-use above. Stop the
# service before revoking its credential; if SCM refuses to stop, server identity
# remains valid and no installed files or background tasks have been removed.
if (Get-Service CyberOrbitAgent -ErrorAction SilentlyContinue) {
  Stop-Service CyberOrbitAgent -ErrorAction Stop
  $service=Get-Service CyberOrbitAgent
  $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Stopped,[TimeSpan]::FromSeconds(45))
}
# Consume the one-use server authorization and revoke enrollment only after SCM
# confirms STOPPED. If the backend is unavailable, restore service operation and
# leave its installation, tasks, credentials and queues intact.
& $node $cli complete-local-operation $configFile $grant.requestId $grant.nonce
if($LASTEXITCODE -ne 0){
  if(Get-Service CyberOrbitAgent -ErrorAction SilentlyContinue){Start-Service CyberOrbitAgent -ErrorAction SilentlyContinue}
  throw 'The server could not confirm credential revocation. Service restart was requested; installed files and enrollment data were preserved.'
}
if (Get-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery' -Confirm:$false }
if (Get-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -Confirm:$false }
if (Get-ScheduledTask -TaskName 'CYBERORBIT Authorized Uninstall' -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName 'CYBERORBIT Authorized Uninstall' -Confirm:$false }
if (Get-Service CyberOrbitAgent -ErrorAction SilentlyContinue) {
  & sc.exe delete CyberOrbitAgent | Out-Null
  if($LASTEXITCODE -ne 0){throw 'Windows did not accept service removal after authorization.'}
}
for($attempt=0;$attempt -lt 30 -and (Get-CimInstance Win32_Service -Filter "Name='CyberOrbitAgent'" -ErrorAction SilentlyContinue);$attempt++){Start-Sleep -Seconds 1}
if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
if ($PurgeData -and (Test-Path -LiteralPath $dataRoot)) { Remove-Item -LiteralPath $dataRoot -Recurse -Force }
elseif(Test-Path -LiteralPath $expectedGrant){Remove-Item -LiteralPath $expectedGrant -Force}
Write-Output 'Main Admin-authorized removal completed. Server credential revoked. Local enrollment data was retained unless -PurgeData was explicitly supplied.'
