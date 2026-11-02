param(
  [Parameter(Mandatory=$true)][string]$WindowsCandidate,
  [Parameter(Mandatory=$true)][string]$MacOSCandidate
)
$ErrorActionPreference='Stop'
$agentRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$dist=[IO.Path]::GetFullPath((Join-Path $agentRoot 'dist'))
$windows=[IO.Path]::GetFullPath($WindowsCandidate);$macos=[IO.Path]::GetFullPath($MacOSCandidate)
foreach($file in @($windows,$macos)) { if(-not(Test-Path -LiteralPath $file -PathType Leaf) -or ((Get-Item -LiteralPath $file -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Release candidate missing or is a reparse point'} }
if($windows -eq $macos -or $windows.StartsWith($dist+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or $macos.StartsWith($dist+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Candidates must be separate validated files outside dist'}
$expected=@('CYBERORBIT-macOS-Build-Kit','CYBERORBIT-macOS-Build-Kit.previous-20261014T161807Z','CYBERORBIT-macOS-Build-Kit.previous-20261015T075246Z','install-kit','macos-runtime-cache','stop-fix-kit','windows','CYBERORBIT-macOS-Build-Kit.zip','CYBERORBIT-macOS-Build-Kit.zip.previous-20261014T161807Z','CYBERORBIT-macOS-Build-Kit.zip.previous-20261015T075246Z','CYBERORBIT-macOS-Build-Kit.zip.sha256','CYBERORBIT-macOS-Build-Kit.zip.sha256.previous-20261014T161807Z','CYBERORBIT-macOS-Build-Kit.zip.sha256.previous-20261015T075246Z','CYBERORBIT-stop-fix-kit.zip','CYBERORBIT-windows.zip','install-kit.zip','node-macos-SHASUMS256.txt','windows-sha256.txt')
$actual=@(Get-ChildItem -LiteralPath $dist -Force | ForEach-Object Name)
if($actual.Count -ne $expected.Count -or @($actual | Where-Object {$_ -notin $expected}).Count -gt 0 -or @($expected | Where-Object {$_ -notin $actual}).Count -gt 0){throw 'agent/dist changed since audit; refusing cleanup of an unclassified item'}
$sensitiveNames=@('agent-config.json','credential.dpapi','credential.host','enrollment-marker','helper-capability.json','collector-config.json','service.lock')
$allEntries=@(Get-ChildItem -LiteralPath $dist -Force -Recurse -ErrorAction Stop)
foreach($entry in $allEntries) {
  if($entry.Name -in $sensitiveNames -or $entry.Extension -in @('.dpapi','.event','.tmp') -or $entry.Name -eq 'queue'){throw "Possible enrolled-device state found inside dist: $($entry.FullName)"}
  if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    $resolved=[IO.Path]::GetFullPath($entry.FullName)
    if(-not $resolved.StartsWith($dist+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Reparse point resolves outside dist; refusing cleanup'}
    $query=& fsutil reparsepoint query $entry.FullName 2>&1
    $tag=([string]($query | Select-Object -First 1))
    if($tag -notmatch '0x9000(e01a|601a)'){throw "Unknown reparse-point type; refusing cleanup: $($entry.FullName)"}
  }
}
# Candidates are moved into the audited directory before removing old artifacts.
$winStage=Join-Path $dist '.CYBERORBIT-Windows.candidate.zip';$macStage=Join-Path $dist '.CYBERORBIT-macOS.candidate.zip'
if((Test-Path $winStage) -or (Test-Path $macStage)){throw 'Candidate staging name already exists; preserve/review it first'}
Move-Item -LiteralPath $windows -Destination $winStage
try { Move-Item -LiteralPath $macos -Destination $macStage } catch { Move-Item -LiteralPath $winStage -Destination $windows; throw }
foreach($entry in @(Get-ChildItem -LiteralPath $dist -Force | Where-Object Name -notin @((Split-Path $winStage -Leaf),(Split-Path $macStage -Leaf)))) {
  $resolved=[IO.Path]::GetFullPath($entry.FullName)
  if([IO.Path]::GetDirectoryName($resolved) -ne $dist){throw 'Cleanup target escaped dist'}
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
Move-Item -LiteralPath $winStage -Destination (Join-Path $dist 'CYBERORBIT-Windows.zip')
Move-Item -LiteralPath $macStage -Destination (Join-Path $dist 'CYBERORBIT-macOS.zip')
$final=@(Get-ChildItem -LiteralPath $dist -Force | Sort-Object Name)
if($final.Count -ne 2 -or $final.Name -notcontains 'CYBERORBIT-Windows.zip' -or $final.Name -notcontains 'CYBERORBIT-macOS.zip'){throw 'Final dist contents do not match the requested two-package layout'}
$env:CYBERORBIT_RELEASE_WINDOWS_ARCHIVE=Join-Path $dist 'CYBERORBIT-Windows.zip';$env:CYBERORBIT_RELEASE_MACOS_ARCHIVE=Join-Path $dist 'CYBERORBIT-macOS.zip'
try { & (Get-Command node.exe -ErrorAction Stop).Source --test (Join-Path $agentRoot 'test/release-package.test.js');if($LASTEXITCODE -ne 0){throw 'Final archive tests failed'} } finally { Remove-Item Env:\CYBERORBIT_RELEASE_WINDOWS_ARCHIVE,Env:\CYBERORBIT_RELEASE_MACOS_ARCHIVE -ErrorAction SilentlyContinue }
Get-FileHash -LiteralPath (Join-Path $dist 'CYBERORBIT-Windows.zip'),(Join-Path $dist 'CYBERORBIT-macOS.zip') -Algorithm SHA256 | Select-Object Path,Hash
Get-ChildItem -LiteralPath $dist -Force | Select-Object Name,Length,Attributes
