param([switch]$InspectOnly)
$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw 'Run in an elevated PowerShell prompt' }
$expectedProgramRoot = [IO.Path]::GetFullPath([Environment]::GetFolderPath('ProgramFiles'))
$expectedDataRoot = [IO.Path]::GetFullPath([Environment]::GetFolderPath('CommonApplicationData'))
$installRoot = [IO.Path]::GetFullPath((Join-Path $expectedProgramRoot 'CYBERORBIT'))
$dataRoot = [IO.Path]::GetFullPath((Join-Path $expectedDataRoot 'CYBERORBIT'))
if ([IO.Path]::GetDirectoryName($installRoot) -ne $expectedProgramRoot -or [IO.Path]::GetDirectoryName($dataRoot) -ne $expectedDataRoot) { throw 'Unexpected cleanup paths; refusing removal' }
if (Get-Service CyberOrbitAgent -ErrorAction SilentlyContinue) { throw 'Agent service exists. Use dashboard revocation and the normal uninstall process; incomplete cleanup is refused.' }
if (Get-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor' -ErrorAction SilentlyContinue) { throw 'Desktop startup task exists. Use the normal uninstall process; incomplete cleanup is refused.' }
foreach ($root in @($installRoot,$dataRoot)) {
  if ((Test-Path -LiteralPath $root) -and ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation/data path is a reparse point; refusing cleanup' }
}
if ((Test-Path -LiteralPath $dataRoot) -and @(Get-ChildItem -LiteralPath $dataRoot -Force).Count -gt 0) {
  throw 'Local data is not empty. Credentials, enrollment state or a queue may exist. Preserve it and review the dashboard; incomplete cleanup is refused.'
}
if (Test-Path -LiteralPath $installRoot) {
  $configPath = Join-Path $installRoot 'agent-config.json'
  if (-not (Test-Path -LiteralPath $configPath)) { throw 'Installation has no recognized agent configuration; refusing cleanup' }
  foreach ($relative in @('runtime/node.exe','src/cli.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $installRoot $relative))) { throw 'Installation is not a recognized staged agent package; refusing cleanup' }
  }
  $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if ([IO.Path]::GetFullPath($config.dataDirectory) -ne $dataRoot) { throw 'Installation points to a different data directory; refusing cleanup' }
  # Refuse junctions anywhere in the recursive deletion tree, including hidden files.
  if (@(Get-ChildItem -LiteralPath $installRoot -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count -gt 0) { throw 'Installation contains reparse points; refusing cleanup' }
}
if ($InspectOnly) { Write-Output "Safe incomplete-install candidate: no startup entries and no local data. Confirm the dashboard device is UNENROLLED before resetting. Paths: $installRoot; $dataRoot"; exit 0 }
if (Test-Path -LiteralPath $installRoot) { Remove-Item -LiteralPath $installRoot -Recurse -Force }
# Deliberately non-recursive: a concurrently created credential/queue blocks removal.
if (Test-Path -LiteralPath $dataRoot) { [IO.Directory]::Delete($dataRoot, $false) }
Write-Output 'Empty incomplete installation removed. No backend credentials were revoked. Issue a fresh token for an UNENROLLED device before reinstalling.'
