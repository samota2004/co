function Save-CyberOrbitUpdateFiles {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][hashtable]$Sources,
    [Parameter(Mandatory=$true)][string]$InstallRoot,
    [Parameter(Mandatory=$true)][string]$BackupRoot,
    [Parameter(Mandatory=$true)][hashtable]$State
  )
  foreach ($relative in $Sources.Keys) {
    $target=Join-Path $InstallRoot $relative
    if (Test-Path -LiteralPath $target) {
      $State.Saved[$relative]=[IO.File]::ReadAllBytes($target)
      $State.AclBefore[$relative]=(Get-Acl -LiteralPath $target).Sddl
      $backupFile=Join-Path $BackupRoot $relative
      New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($backupFile)) -Force | Out-Null
      [IO.File]::WriteAllBytes($backupFile,$State.Saved[$relative])
    } else {
      $State.CreatedTargets += $target
    }
    # Existing file writes preserve owner/DACL/inheritance; verify that invariant.
    [IO.File]::WriteAllBytes($target,[IO.File]::ReadAllBytes($Sources[$relative]))
    if ($State.AclBefore.ContainsKey($relative) -and (Get-Acl -LiteralPath $target).Sddl -ne $State.AclBefore[$relative]) {
      throw 'Code ACL changed unexpectedly'
    }
  }
}

function Restore-CyberOrbitUpdateFiles {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][hashtable]$State,
    [Parameter(Mandatory=$true)][string]$InstallRoot
  )
  foreach ($relative in $State.Saved.Keys) {
    $target=Join-Path $InstallRoot $relative
    [IO.File]::WriteAllBytes($target,$State.Saved[$relative])
    $restoredAcl=Get-Acl -LiteralPath $target
    $restoredAcl.SetSecurityDescriptorSddlForm($State.AclBefore[$relative])
    Set-Acl -LiteralPath $target -AclObject $restoredAcl
  }
  foreach ($target in $State.CreatedTargets) { Remove-Item -LiteralPath $target -Force -ErrorAction SilentlyContinue }
}
