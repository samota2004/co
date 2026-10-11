param([switch]$Exclusive, [switch]$BrowserTitles)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$session = [string][Diagnostics.Process]::GetCurrentProcess().SessionId
$desktopMutex = $null
$ownsDesktopMutex = $false
try {
  # One authenticated collector per Windows user/session. Diagnostic calls
  # without -Exclusive only print samples and do not submit them to IPC.
  if ($Exclusive) {
    $desktopMutex = New-Object Threading.Mutex($false, "Local\CYBERORBIT.Desktop.$sid.$session")
    try { $ownsDesktopMutex = $desktopMutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $ownsDesktopMutex = $true }
    if (-not $ownsDesktopMutex) { throw 'CYBERORBIT_DESKTOP_ALREADY_RUNNING: a desktop collector is already running in this Windows session.' }
  }
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-api.cs')
  $appNames = @{}
  $nextAppRefresh = [DateTime]::MinValue
  while ($true) {
    $locked = [OrbitDesktop]::Locked()
    $foregroundPid = [OrbitDesktop]::ForegroundPid()
    $name = ''
    if ($foregroundPid -gt 0) { try { $name = [string](Get-Process -Id $foregroundPid -ErrorAction Stop).ProcessName } catch {} }
    $hostName = ''
    $identitySource = 'process'
    if ($name -in @('ApplicationFrameHost','WWAHost') -and -not [OrbitDesktop]::AppId([int]$foregroundPid)) {
      $hostName = $name
      $resolvedPid = [OrbitDesktop]::HostedPid($foregroundPid)
      $identitySource = 'unresolved-host'
      if ($resolvedPid -gt 0 -and $resolvedPid -ne $foregroundPid) {
        try {
          $resolved = Get-Process -Id $resolvedPid -ErrorAction Stop
          if ($resolved.SessionId -eq [int]$session) {
            $foregroundPid = $resolvedPid
            $name = [string]$resolved.ProcessName
            $identitySource = 'hosted-process'
          }
        } catch {}
      }
    }
    $appId = [OrbitDesktop]::AppId([int]$foregroundPid)
    $appName = $name
    if ($appId) {
      if ((Get-Date) -ge $nextAppRefresh) {
        try { Get-StartApps -ErrorAction Stop | ForEach-Object { $appNames[$_.AppID] = $_.Name } } catch {}
        $nextAppRefresh = (Get-Date).AddMinutes(5)
      }
      if ($appNames.ContainsKey($appId)) { $appName = [string]$appNames[$appId]; $identitySource = 'windows-app-id' }
    }
    $sample = @{ identity=$sid; sessionId=$session; pid=[int]$foregroundPid; name=$name; locked=$locked; idleMilliseconds=[long][OrbitDesktop]::IdleMilliseconds() }
    $sample.appId = $appId
    $sample.appName = $appName
    $sample.hostName = $hostName
    $sample.identitySource = $identitySource
    if ($BrowserTitles -and -not $locked -and $sample.idleMilliseconds -lt 60000 -and $name -match '^(chrome|brave|msedge|firefox)$') {
      $sample.browserTitle = [OrbitDesktop]::BrowserTitle($foregroundPid)
    }
    $sample | ConvertTo-Json -Compress
    Start-Sleep -Seconds 2
  }
} finally {
  if ($ownsDesktopMutex) { $desktopMutex.ReleaseMutex() }
  if ($null -ne $desktopMutex) { $desktopMutex.Dispose() }
}
