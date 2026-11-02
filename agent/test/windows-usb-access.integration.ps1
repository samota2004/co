param(
  [Parameter(Mandatory=$true)][ValidateSet('Prepare','VerifyBlocked','VerifyAllowed','Cleanup')][string]$Mode,
  [Parameter(Mandatory=$true)][string]$DriveRoot,
  [string]$MarkerName
)
$ErrorActionPreference = 'Stop'
function Stop-Test([string]$Message) { @{ status='NOT_TESTED'; reason=$Message } | ConvertTo-Json -Compress; exit 2 }
function Is-AccessDenied($ErrorRecord) {
  $exception=$ErrorRecord.Exception
  while ($null -ne $exception) {
    if ($exception -is [UnauthorizedAccessException] -or (($exception.HResult -band 0xffff) -eq 5)) { return $true }
    $exception=$exception.InnerException
  }
  return $false
}

# This probe is intentionally run as the ordinary mapped employee, never as
# LocalSystem or an administrator. It performs no policy changes.
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Stop-Test 'Run this probe from a standard employee account, not an elevated shell.' }
if ($DriveRoot -notmatch '^[A-Za-z]:\\?$') { Stop-Test 'Supply only a drive root such as E:\\.' }
$driveLetter = $DriveRoot.Substring(0,1).ToUpperInvariant()
try { $disk = Get-Disk -Number (Get-Partition -DriveLetter $driveLetter).DiskNumber -ErrorAction Stop } catch { Stop-Test 'Cannot identify the selected drive and its physical bus.' }
if ([string]$disk.BusType -ne 'USB') { Stop-Test 'Selected volume is not independently identified as a USB-bus disk.' }
try { $volume = Get-Volume -DriveLetter $driveLetter -ErrorAction Stop } catch { Stop-Test 'Cannot identify the selected volume.' }
if ($volume.FileSystemLabel -cne 'CYBERORBIT-USB-TEST') { Stop-Test 'Volume label must be exactly CYBERORBIT-USB-TEST.' }
$root = '{0}:\' -f $driveLetter
$markerPattern = '^CYBERORBIT-USB-TEST-[0-9a-f]{32}\.txt$'

if ($Mode -eq 'Prepare') {
  $MarkerName = 'CYBERORBIT-USB-TEST-{0}.txt' -f ([guid]::NewGuid().ToString('N'))
  $markerPath = Join-Path $root $MarkerName
  try { [IO.File]::WriteAllText($markerPath,'CYBERORBIT disposable access probe') } catch { Stop-Test 'Could not create the disposable marker before policy enforcement.' }
  @{ status='PREPARED'; drive=$root; marker=$MarkerName; bus=[string]$disk.BusType; label=$volume.FileSystemLabel } | ConvertTo-Json -Compress
  exit 0
}
if (-not $MarkerName -or $MarkerName -notmatch $markerPattern) { Stop-Test 'Pass the exact marker filename emitted by Prepare.' }
$markerPath = Join-Path $root $MarkerName
if (-not [IO.Path]::GetFullPath($markerPath).StartsWith([IO.Path]::GetFullPath($root),[StringComparison]::OrdinalIgnoreCase)) { Stop-Test 'Marker escaped selected test volume.' }

if ($Mode -eq 'Cleanup') {
  try {
    if ([IO.File]::ReadAllText($markerPath) -ne 'CYBERORBIT disposable access probe') { Stop-Test 'Marker contents do not match; refusing cleanup.' }
    Remove-Item -LiteralPath $markerPath -Force -ErrorAction Stop
    if ([IO.File]::Exists($markerPath)) { Stop-Test 'Marker still exists after cleanup.' }
    @{ status='CLEANED'; marker=$MarkerName } | ConvertTo-Json -Compress; exit 0
  } catch { Stop-Test 'Marker cleanup was denied or the marker is unavailable; restore ALLOW and retry cleanup.' }
}

$listingDenied=$false;$readDenied=$false;$writeDenied=$false
try { $null = Get-ChildItem -LiteralPath $root -ErrorAction Stop } catch { if (Is-AccessDenied $_) { $listingDenied=$true } else { Stop-Test 'Directory listing failed for a reason other than access denial; result is not a policy verification.' } }
try { $content=[IO.File]::ReadAllText($markerPath); if ($content -ne 'CYBERORBIT disposable access probe') { Stop-Test 'Marker contents do not match the prepared disposable test.' } } catch { if (Is-AccessDenied $_) { $readDenied=$true } else { Stop-Test 'Marker read failed for a reason other than access denial; result is not a policy verification.' } }
$probeName='CYBERORBIT-USB-TEST-WRITE-{0}.tmp' -f ([guid]::NewGuid().ToString('N'))
$probePath=Join-Path $root $probeName
try { [IO.File]::WriteAllText($probePath,'disposable') } catch { if (Is-AccessDenied $_) { $writeDenied=$true } else { Stop-Test 'Write probe failed for a reason other than access denial; result is not a policy verification.' } }
if (-not $writeDenied -and (Test-Path -LiteralPath $probePath)) { try { Remove-Item -LiteralPath $probePath -Force -ErrorAction Stop } catch { Stop-Test ('Disposable write probe {0} could not be removed; clean it up manually after restoring ALLOW.' -f $probeName) } }

if ($Mode -eq 'VerifyBlocked') {
  $passed=$listingDenied -and $readDenied -and $writeDenied
  @{ status=$(if($passed){'ACCESS_DENIED_VERIFIED_FOR_THIS_VOLUME'}else{'BLOCK_NOT_VERIFIED'}); listingDenied=$listingDenied; readDenied=$readDenied; writeDenied=$writeDenied; drive=$root; marker=$MarkerName; diskModel=$disk.FriendlyName } | ConvertTo-Json -Compress
  if (-not $passed) { exit 1 }; exit 0
}
$passed=(-not $listingDenied) -and (-not $readDenied) -and (-not $writeDenied)
@{ status=$(if($passed){'ACCESS_ALLOWED_VERIFIED_FOR_THIS_VOLUME'}else{'ALLOW_NOT_VERIFIED'}); listingDenied=$listingDenied; readDenied=$readDenied; writeDenied=$writeDenied; drive=$root; marker=$MarkerName; diskModel=$disk.FriendlyName } | ConvertTo-Json -Compress
if (-not $passed) { exit 1 }; exit 0
