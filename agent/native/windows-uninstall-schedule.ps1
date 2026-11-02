$ErrorActionPreference='Stop'
$inputObject=[Console]::In.ReadToEnd()|ConvertFrom-Json
if(-not $inputObject.requestId -or $inputObject.requestId -notmatch '^[0-9a-f-]{36}$'){throw 'Invalid authorized request identifier.'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
if($identity.User.Value -ne 'S-1-5-18'){throw 'Only the CYBERORBIT LocalSystem service may schedule an authorized uninstall.'}
$installRoot=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'CYBERORBIT'))
$dataRoot=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'CYBERORBIT'))
$scriptPath=Join-Path $installRoot 'packaging/windows/uninstall.ps1'
$grantPath=Join-Path $dataRoot 'local-operation-grant.json'
foreach($path in @($installRoot,$dataRoot,$scriptPath,$grantPath)){
  if(-not (Test-Path -LiteralPath $path)){throw 'Authorized uninstall input is missing.'}
  if((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Reparse point found in protected uninstall path.'}
}
$grant=Get-Content -LiteralPath $grantPath -Raw|ConvertFrom-Json
if($grant.requestId -ne $inputObject.requestId -or $grant.action -ne 'AGENT_UNINSTALL' -or [DateTime]::Parse($grant.expiresAt).ToUniversalTime() -le [DateTime]::UtcNow){throw 'Uninstall grant is expired or bound to another request.'}
$taskName='CYBERORBIT Authorized Uninstall'
$arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$scriptPath+'" -AuthorizationGrantPath "'+$grantPath+'"'
$action=New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe') -Argument $arguments
$trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force|Out-Null
$scheduler=New-Object -ComObject 'Schedule.Service';$scheduler.Connect();$scheduler.GetFolder('\').GetTask($taskName).SetSecurityDescriptor('D:P(A;;GA;;;SY)(A;;GA;;;BA)',16)
Start-ScheduledTask -TaskName $taskName
Write-Output 'Main Admin-approved uninstall has been scheduled under LocalSystem.'
