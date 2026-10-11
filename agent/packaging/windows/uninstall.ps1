param([switch]$PurgeData)
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run as Administrator to remove CYBERORBIT.' }
if (Get-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery'; Unregister-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery' -Confirm:$false }
if (Get-Service CyberOrbitAgent -ErrorAction SilentlyContinue) { Stop-Service CyberOrbitAgent; & sc.exe delete CyberOrbitAgent | Out-Null }
if (Get-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor'; Unregister-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -Confirm:$false }
$installRoot = [IO.Path]::GetFullPath((Join-Path $env:ProgramFiles 'CYBERORBIT'))
$dataRoot = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'CYBERORBIT'))
if ($installRoot -ne 'C:\Program Files\CYBERORBIT' -and $installRoot -ne [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'CYBERORBIT'))) { throw 'Unexpected installation path' }
if ($dataRoot -ne [IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'CYBERORBIT'))) { throw 'Unexpected data path' }
if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
if ($PurgeData -and (Test-Path -LiteralPath $dataRoot)) { Remove-Item -LiteralPath $dataRoot -Recurse -Force }
Write-Output 'Startup removed. Revoke the device in CYBERORBIT; local removal does not revoke server credentials. Data retained unless -PurgeData was supplied.'
