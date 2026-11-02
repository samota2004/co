param(
  [Parameter(Mandatory=$true)][ValidateSet('SERVICE_STOP','AGENT_UNINSTALL')][string]$Action,
  [Parameter(Mandatory=$true)][string]$Reason
)
$ErrorActionPreference='Stop'
if($Reason.Trim().Length -lt 8 -or $Reason.Trim().Length -gt 500){throw 'Reason must contain 8–500 characters.'}
$installRoot=[IO.Path]::GetFullPath((Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'CYBERORBIT'))
$config=Join-Path $installRoot 'agent-config.json';$node=Join-Path $installRoot 'runtime/node.exe';$cli=Join-Path $installRoot 'src/cli.js'
foreach($path in @($config,$node,$cli)){if(-not(Test-Path -LiteralPath $path -PathType Leaf) -or ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Expected protected CYBERORBIT installation files are unavailable.'}}
$command=if($Action -eq 'SERVICE_STOP'){'request-stop'}else{'request-uninstall'}
& $node $cli $command $config $Reason
if($LASTEXITCODE -ne 0){throw 'The agent service did not accept this request. No service or enrollment state was changed.'}
