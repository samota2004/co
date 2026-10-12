param(
    [ValidateSet('Enable', 'Disable')]
    [string]$Action = 'Disable'
)

$ErrorActionPreference = 'Stop'
$configPath = Join-Path $env:ProgramFiles 'CYBERORBIT\agent-config.json'

$admin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (-not $admin) {
    throw 'Run PowerShell as Administrator.'
}

if (-not (Test-Path -LiteralPath $configPath)) {
    throw 'CYBERORBIT agent configuration not found.'
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

if ($Action -eq 'Enable') {
    Write-Host 'CYBERORBIT can collect active browser window titles, including private page names and search terms.'
    Write-Host 'It does not collect page contents or full browsing history through this feature.'
    $consent = Read-Host 'Employee approval required. Type YES to enable'

    if ($consent -cne 'YES') {
        throw 'Approval not provided. No changes made.'
    }
}

$config | Add-Member -NotePropertyName browserTitles `
    -NotePropertyValue ($Action -eq 'Enable') -Force

$tempPath = "$configPath.tmp"
$config | ConvertTo-Json -Depth 20 |
    Set-Content -LiteralPath $tempPath -Encoding UTF8

Move-Item -LiteralPath $tempPath -Destination $configPath -Force

Write-Host "Local browser-title approval: $Action"
Write-Host 'Restart the agent service and desktop helper for changes to take effect.'