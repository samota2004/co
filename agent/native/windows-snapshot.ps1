$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'windows-api.cs')
$r = [Console]::In.ReadToEnd() | ConvertFrom-Json
$result = @{}
if ($r.processes) {
  $result.processes = @([OrbitProcesses]::Snapshot())
}
if ($r.sessions) { $result.sessions = @([OrbitSessions]::Snapshot()) }
if ($r.usb) {
  $result.usb = @(Get-CimInstance Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB%'" | Where-Object { $_.Present -ne $false } | ForEach-Object {
    $class=([string]$_.ClassGuid).Trim('{}').ToLowerInvariant()
    $category=switch($class){
      '4d36e967-e325-11ce-bfc1-08002be10318' {'USB_STORAGE';break}
      'eec5ad98-8080-425f-922a-dabf3de3f69a' {'PORTABLE_DEVICE';break}
      '4d36e965-e325-11ce-bfc1-08002be10318' {'CD_DVD';break}
      '4d36e96b-e325-11ce-bfc1-08002be10318' {'KEYBOARD';break}
      '4d36e96f-e325-11ce-bfc1-08002be10318' {'MOUSE';break}
      '745a17a0-74d3-11d0-b6fe-00a0c90f57da' {'HID_PERIPHERAL';break}
      default {'OTHER'}
    }
    @{hardwareId=[string]$_.PNPDeviceID;name=[string]$_.Name;category=$category}
  })
}
if ($r.network) {
  $result.network = @(Get-NetTCPConnection -ErrorAction Stop | ForEach-Object { @{pid=[int]$_.OwningProcess;protocol='TCP';localAddress=[string]$_.LocalAddress;localPort=[int]$_.LocalPort;remoteAddress=[string]$_.RemoteAddress;remotePort=[int]$_.RemotePort;state=[string]$_.State} })
}
$result | ConvertTo-Json -Depth 8 -Compress
