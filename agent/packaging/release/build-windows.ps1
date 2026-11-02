param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
$agentRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$dist = Join-Path $agentRoot 'dist'
if (-not $OutputPath) { $OutputPath = Join-Path $dist 'CYBERORBIT-Windows.zip' }
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$null = New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force
if (Test-Path -LiteralPath $OutputPath) { throw "Refusing to overwrite existing package: $OutputPath" }
$node = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = & $node --version
if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) { throw 'Node >=22 required on the Windows build host' }
$stage = Join-Path ([IO.Path]::GetTempPath()) ('cyberorbit-win-release-' + [guid]::NewGuid().ToString('N'))
$archiveTemp = $OutputPath + '.' + [guid]::NewGuid().ToString('N') + '.tmp.zip'
try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  foreach ($folder in @('src','shared','browser-companion')) { Copy-Item -LiteralPath (Join-Path $agentRoot $folder) -Destination $stage -Recurse }
  New-Item -ItemType Directory -Path (Join-Path $stage 'native'),(Join-Path $stage 'packaging/windows'),(Join-Path $stage 'runtime') -Force | Out-Null
  foreach ($file in @('windows-api.cs','windows-snapshot.ps1','windows-desktop.ps1','windows-account-control.ps1','windows-usb-policy.ps1','vault.ps1')) { Copy-Item -LiteralPath (Join-Path $agentRoot "native/$file") -Destination (Join-Path $stage 'native') }
  Get-ChildItem -LiteralPath (Join-Path $agentRoot 'packaging/windows') -File | Where-Object { $_.Extension -in @('.ps1','.cs') -and $_.Name -ne 'build.ps1' } | Copy-Item -Destination (Join-Path $stage 'packaging/windows')
  Copy-Item -LiteralPath (Join-Path $agentRoot 'package.json') -Destination $stage
  foreach ($doc in @('README.md','CHANGES.md','VERIFICATION.md')) { Copy-Item -LiteralPath (Join-Path $agentRoot $doc) -Destination $stage }
  Copy-Item -LiteralPath $node -Destination (Join-Path $stage 'runtime/node.exe')
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  & $compiler /nologo /target:exe "/out:$stage/CyberOrbitService.exe" /reference:System.ServiceProcess.dll (Join-Path $agentRoot 'packaging/windows/ServiceHost.cs')
  if ($LASTEXITCODE -ne 0) { throw 'Windows service host compilation failed' }
  $manifest = [ordered]@{ format=1; platform='windows'; packageVersion=(Get-Content (Join-Path $stage 'package.json') -Raw | ConvertFrom-Json).version; builtAtUtc=[DateTime]::UtcNow.ToString('o'); nodeVersion=$nodeVersion; files=@() }
  Get-ChildItem -LiteralPath $stage -Recurse -File | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($stage.Length + 1).Replace('\','/')
    $manifest.files += [ordered]@{ path=$relative; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
  }
  [IO.File]::WriteAllText((Join-Path $stage 'package-manifest.json'),($manifest | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  $required = @('runtime/node.exe','CyberOrbitService.exe','src/service.js','src/remote-stop.js','src/macos-user.js','shared/contract.js','native/windows-usb-policy.ps1','packaging/windows/install.ps1','packaging/windows/uninstall.ps1','packaging/windows/update-installed.ps1','packaging/windows/update-source-files.ps1','packaging/windows/desktop-watchdog.ps1','package-manifest.json')
  foreach ($relative in $required) { if (-not (Test-Path -LiteralPath (Join-Path $stage $relative) -PathType Leaf)) { throw "Required Windows package component missing: $relative" } }
  $excluded = @(Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object { $_.Extension -in @('.map','.test.js','.tmp') -or $_.FullName -match '[\\/](node_modules|\.git|__pycache__)[\\/]' })
  if ($excluded.Count) { throw 'Development artifact found in Windows release stage' }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archiveTemp -CompressionLevel Optimal
  $previousArchive = $env:CYBERORBIT_RELEASE_WINDOWS_ARCHIVE
  try {
    $env:CYBERORBIT_RELEASE_WINDOWS_ARCHIVE = $archiveTemp
    & $node --test (Join-Path $agentRoot 'test/release-package.test.js')
    if ($LASTEXITCODE -ne 0) { throw 'Release archive regression tests failed; final package not published' }
  } finally { $env:CYBERORBIT_RELEASE_WINDOWS_ARCHIVE = $previousArchive }
  $check = Join-Path ([IO.Path]::GetTempPath()) ('cyberorbit-win-check-' + [guid]::NewGuid().ToString('N'))
  try {
    Expand-Archive -LiteralPath $archiveTemp -DestinationPath $check
    foreach ($relative in $required) { if (-not (Test-Path -LiteralPath (Join-Path $check $relative) -PathType Leaf)) { throw "Archive validation missing: $relative" } }
    $zipHash = (Get-FileHash -LiteralPath $archiveTemp -Algorithm SHA256).Hash.ToLowerInvariant()
    Move-Item -LiteralPath $archiveTemp -Destination $OutputPath
    Write-Output (@{success=$true;platform='windows';package=$OutputPath;sha256=$zipHash;bytes=(Get-Item $OutputPath).Length} | ConvertTo-Json -Compress)
  } finally { if (Test-Path $check) { Remove-Item -LiteralPath $check -Recurse -Force } }
} finally { if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }; if (Test-Path $archiveTemp) { Remove-Item -LiteralPath $archiveTemp -Force } }
