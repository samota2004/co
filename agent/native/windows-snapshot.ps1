$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'windows-api.cs')
$r = [Console]::In.ReadToEnd() | ConvertFrom-Json
$result = @{}
if ($r.processes) {
  $result.processes = @([OrbitProcesses]::Snapshot())
}
if ($r.sessions) { $result.sessions = @([OrbitSessions]::Snapshot()) }
if ($r.usb) {
  $result.usb = @(Get-CimInstance Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB%'" | Where-Object { $_.Present -ne $false } | ForEach-Object { @{hardwareId=[string]$_.PNPDeviceID;name=[string]$_.Name} })
}
if ($r.network) {
  $result.network = @(Get-NetTCPConnection -ErrorAction Stop | ForEach-Object { @{pid=[int]$_.OwningProcess;protocol='TCP';localAddress=[string]$_.LocalAddress;localPort=[int]$_.LocalPort;remoteAddress=[string]$_.RemoteAddress;remotePort=[int]$_.RemotePort;state=[string]$_.State} })
}
$result | ConvertTo-Json -Depth 8 -Compress
