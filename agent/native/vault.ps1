$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$r = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($r.action -eq 'protect') {
  $bytes = [Text.Encoding]::UTF8.GetBytes($r.value)
  [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine))
} elseif ($r.action -eq 'unprotect') {
  $bytes = [Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($r.value), $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
  [Text.Encoding]::UTF8.GetString($bytes)
} else { throw 'Invalid vault action' }
