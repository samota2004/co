function Test-CyberOrbitAdministrator {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function ConvertTo-CyberOrbitNativeArgument([string]$Value) {
  if ($Value -notmatch '[\s"]') { return $Value }
  return '"' + $Value.Replace('"','\"') + '"'
}

function Invoke-CyberOrbitElevation {
  param([Parameter(Mandatory=$true)][string]$ScriptPath,[string[]]$ScriptArguments=@())
  if (Test-CyberOrbitAdministrator) { return $null }
  $powerShell = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(ConvertTo-CyberOrbitNativeArgument $ScriptPath))
  foreach ($argument in $ScriptArguments) { $arguments += ConvertTo-CyberOrbitNativeArgument $argument }
  try {
    $process = Start-Process -FilePath $powerShell -ArgumentList ($arguments -join ' ') -Verb RunAs -Wait -PassThru
    return [int]$process.ExitCode
  } catch {
    Write-Warning 'Windows Administrator elevation was cancelled or denied. CYBERORBIT made no changes.'
    return 1223
  }
}
