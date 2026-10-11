param([string]$NodeExe = (Get-Command node.exe).Source)
$ErrorActionPreference = 'Stop'
$agentRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = Join-Path $agentRoot 'dist/windows'
if (-not (Test-Path -LiteralPath $NodeExe)) { throw 'Node runtime required on the BUILD machine only' }
$runtimeVersion = & $NodeExe --version
if ($LASTEXITCODE -ne 0 -or [int]($runtimeVersion.TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node >=22 required' }
New-Item -ItemType Directory -Path $output -Force | Out-Null
foreach ($folder in @('src','shared','native','packaging')) { Copy-Item -LiteralPath (Join-Path $agentRoot $folder) -Destination $output -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $agentRoot 'package.json') -Destination $output -Force
foreach ($doc in @('README.md','CHANGES.md','VERIFICATION.md')) { Copy-Item -LiteralPath (Join-Path $agentRoot $doc) -Destination $output -Force }
New-Item -ItemType Directory -Path (Join-Path $output 'runtime') -Force | Out-Null
Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $output 'runtime/node.exe') -Force
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:exe "/out:$output/CyberOrbitService.exe" /reference:System.ServiceProcess.dll (Join-Path $PSScriptRoot 'ServiceHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'Service host compilation failed' }
$agentVersion = (Get-Content -LiteralPath (Join-Path $agentRoot 'package.json') -Raw | ConvertFrom-Json).version
@{ agentVersion=$agentVersion; nodeVersion=$runtimeVersion; runtimeSha256=(Get-FileHash -LiteralPath (Join-Path $output 'runtime/node.exe') -Algorithm SHA256).Hash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'build-manifest.json') -Encoding UTF8
Get-ChildItem -LiteralPath $output -Recurse -File | ForEach-Object { "$( (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash )  $($_.FullName.Substring($output.Length+1))" } | Set-Content -LiteralPath (Join-Path $agentRoot 'dist/windows-sha256.txt')
Compress-Archive -Path (Join-Path $output '*') -DestinationPath (Join-Path $agentRoot 'dist/CYBERORBIT-windows.zip') -Force
# Keep the documented extracted kit current too. Rebuilding the ZIP alone left
# existing install-kit users running old installers and hiding useful errors.
$distRoot = [IO.Path]::GetFullPath((Join-Path $agentRoot 'dist'))
$kitRoot = [IO.Path]::GetFullPath((Join-Path $distRoot 'install-kit'))
if ([IO.Path]::GetDirectoryName($kitRoot) -ne $distRoot) { throw 'Unexpected installation kit path' }
if (Test-Path -LiteralPath $kitRoot) {
  if ((Get-Item -LiteralPath $kitRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Installation kit is a reparse point; refusing refresh' }
  $state = @(Get-ChildItem -LiteralPath $kitRoot -Recurse -Force | Where-Object {
    $_.Name -in @('agent-config.json','enrollment-marker','helper-capability.json','collector-config.json','queue') -or
    $_.Extension -in @('.dpapi','.event','.tmp') -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
  })
  if ($state.Count -gt 0) { throw 'Installation kit contains local state or reparse points; preserve/review it before refreshing' }
}
Expand-Archive -LiteralPath (Join-Path $distRoot 'CYBERORBIT-windows.zip') -DestinationPath $kitRoot -Force
Write-Output "Built $agentRoot/dist/CYBERORBIT-windows.zip ($runtimeVersion included). Unsigned development package."
Write-Output "Refreshed $kitRoot (agent $agentVersion)."
