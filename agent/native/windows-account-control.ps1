$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$code = 'NATIVE_ERROR'
try {
  $r = [Console]::In.ReadToEnd() | ConvertFrom-Json
  if ($r.action -notin @('CHECK','ALLOW','BLOCK')) { throw 'Invalid action' }
  $sidPattern = '^S-1-5-21-\d+-\d+-\d+-\d+$'
  $code = 'UNSAFE_ACCOUNT'
  if ($r.employeeSid -notmatch $sidPattern -or $r.recoveryAdminSid -notmatch $sidPattern -or $r.employeeSid -eq $r.recoveryAdminSid) { throw 'Invalid SID mapping' }
  if ([uint64]($r.employeeSid.Split('-')[-1]) -lt 1000) { throw 'Built-in account refused' }
  $code = 'ACCESS_DENIED'
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Elevation required' }
  Import-Module Microsoft.PowerShell.LocalAccounts -ErrorAction Stop
  $code = 'UNSUPPORTED_MACHINE'
  if ((Get-CimInstance Win32_ComputerSystem).PartOfDomain) { throw 'Domain-managed machine refused' }
  $code = 'UNSAFE_ACCOUNT'
  $employee = Get-LocalUser -SID ([Security.Principal.SecurityIdentifier]$r.employeeSid)
  if ([string]$employee.PrincipalSource -ne 'Local') { throw 'Local account required' }
  $admins = @(Get-LocalGroupMember -SID ([Security.Principal.SecurityIdentifier]'S-1-5-32-544'))
  # Refuse ambiguous nested group membership instead of risking an admin lockout.
  if (@($admins | Where-Object { $_.ObjectClass -ne 'User' }).Count -gt 0 -or
      @($admins | Where-Object { $_.SID.Value -eq $r.employeeSid }).Count -gt 0) { throw 'Administrator or ambiguous membership refused' }
  $code = 'UNSAFE_RECOVERY'
  $recovery = Get-LocalUser -SID ([Security.Principal.SecurityIdentifier]$r.recoveryAdminSid)
  if (-not $recovery.Enabled -or [string]$recovery.PrincipalSource -ne 'Local' -or
      ($recovery.AccountExpires -and $recovery.AccountExpires -le (Get-Date)) -or
      ($recovery.PasswordExpires -and $recovery.PasswordExpires -le (Get-Date)) -or
      @($admins | Where-Object { $_.SID.Value -eq $r.recoveryAdminSid }).Count -ne 1) { throw 'Working separate recovery admin required' }
  if ($r.action -eq 'CHECK') {
    @{code='READY'; employeeEnabled=[bool]$employee.Enabled} | ConvertTo-Json -Compress
    exit 0
  }
  $code = 'UNSAFE_STORAGE'
  if (-not [IO.Path]::IsPathRooted($r.stateDirectory) -or $r.deviceId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Invalid storage' }
  $directory = Get-Item -LiteralPath $r.stateDirectory -Force
  if (-not $directory.PSIsContainer) { throw 'Directory required' }
  for ($part=$directory; $null -ne $part; $part=$part.Parent) {
    if ($part.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked storage refused' }
  }
  # Journal must be writable only by SYSTEM/Administrators (read-only employee
  # traversal on the parent directory is permitted).
  $writeMask = [Security.AccessControl.FileSystemRights]'WriteData,AppendData,WriteAttributes,WriteExtendedAttributes,Delete,DeleteSubdirectoriesAndFiles,ChangePermissions,TakeOwnership'
  $journal = Join-Path $directory.FullName 'windows-account-control.json'
  $protectedPaths = @($directory.FullName)
  if (Test-Path -LiteralPath $journal) { $protectedPaths += $journal }
  foreach ($protectedPath in $protectedPaths) {
  foreach ($entry in (Get-Acl -LiteralPath $protectedPath).Access) {
    $sid = $entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
    if ($entry.AccessControlType -eq 'Allow' -and ($entry.FileSystemRights -band $writeMask) -ne 0 -and $sid -notin @('S-1-5-18','S-1-5-32-544')) { throw 'Untrusted journal writer' }
  }
  }
  $state = $null
  if (Test-Path -LiteralPath $journal) {
    if ((Get-Item -LiteralPath $journal -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked journal refused' }
    $state = Get-Content -LiteralPath $journal -Raw | ConvertFrom-Json
    $code = 'RECOVERY_REQUIRED'
    if ($state.deviceId -ne $r.deviceId -or $state.employeeSid -ne $r.employeeSid -or $state.phase -ne 'BLOCKED') { throw 'Uncertain ownership requires recovery' }
  }
  $code = 'NATIVE_ERROR'
  if ($r.action -eq 'ALLOW') {
    if ($state) {
      Enable-LocalUser -SID $employee.SID
      if (-not (Get-LocalUser -SID $employee.SID).Enabled) { throw 'Enable not confirmed' }
      Remove-Item -LiteralPath $journal -Force
    } elseif (-not $employee.Enabled) {
      @{code='EXTERNALLY_DISABLED'} | ConvertTo-Json -Compress
      exit 0
    }
    @{code='ALLOWED'} | ConvertTo-Json -Compress
    exit 0
  }
  if (-not $state) {
    if (-not $employee.Enabled) { @{code='EXTERNALLY_DISABLED'} | ConvertTo-Json -Compress; exit 0 }
    # A crash between intent and confirmed disable never grants permission to
    # enable an account automatically: PREPARED requires local admin recovery.
    $state = @{deviceId=$r.deviceId;employeeSid=$r.employeeSid;phase='PREPARED'}
    [IO.File]::WriteAllText($journal,($state | ConvertTo-Json -Compress))
  }
  Disable-LocalUser -SID $employee.SID
  if ((Get-LocalUser -SID $employee.SID).Enabled) { throw 'Disable not confirmed' }
  $state.phase='BLOCKED'
  [IO.File]::WriteAllText($journal,($state | ConvertTo-Json -Compress))
  Add-Type -Path (Join-Path $PSScriptRoot 'windows-api.cs')
  [OrbitSessions]::LogoffIdentity($r.employeeSid)
  $remaining = @([OrbitSessions]::Snapshot() | Where-Object { $_.identity -eq $r.employeeSid })
  @{code=$(if ($remaining.Count) {'LOGOFF_PENDING'} else {'BLOCKED'})} | ConvertTo-Json -Compress
} catch {
  # Do not print exception text, names, request input or credentials.
  @{code=$code} | ConvertTo-Json -Compress
}
