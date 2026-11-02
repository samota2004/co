$ErrorActionPreference='Stop'
$request=[Console]::In.ReadToEnd()|ConvertFrom-Json
$policy=$request.policy
if(-not $policy -or @($policy.PSObject.Properties.Name).Count -ne 3 -or @($policy.PSObject.Properties.Name|Where-Object {$_ -notin @('storage','portable','optical')}).Count -gt 0){throw 'Invalid USB policy'}
foreach($name in @('storage','portable','optical')){if($policy.$name -notin @('ALLOW','BLOCK')){throw 'Invalid USB policy'}}
$osInfo=Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue
$edition=[string]$osInfo.EditionID
$build=0;$ubr=0
[void][int]::TryParse([string]$osInfo.CurrentBuildNumber,[ref]$build)
[void][int]::TryParse([string]$osInfo.UBR,[ref]$ubr)
$supportedEditions=@('Professional','Enterprise','Education','IoTEnterprise','IoTEnterpriseS')
# Microsoft documents this policy on Pro/Enterprise/Education/IoT Enterprise:
# Win10 2004/20H2/21H1 require KB5005101 (build .1202); Win11 starts at 22000.
$supportedBuild=($build -ge 22000) -or ($build -ge 19044) -or (($build -ge 19041 -and $build -le 19043) -and $ubr -ge 1202)
if($edition -notin $supportedEditions -or -not $supportedBuild){@{status='POLICY_UNSUPPORTED';detail='Windows edition/build is outside the documented removable-storage policy target'}|ConvertTo-Json -Compress;exit 0}
$classes=@{
  storage='{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}'
  portable='{6ac27878-a6fa-4155-ba85-f98f491d4f33}'
  optical='{53f56308-b6bf-11d0-94f2-00a0c91efb8b}'
}
$base='HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices'
$owner='HKLM:\SOFTWARE\CYBERORBIT\UsbPolicy'
if(-not(Test-Path $owner)){New-Item -Path $owner -Force|Out-Null}
$verified=$true
foreach($category in @('storage','portable','optical')){
  $key=Join-Path $base $classes[$category];$stateName=$category
  $desired=$policy.$category -eq 'BLOCK'
  $owned=(Get-ItemProperty -Path $owner -Name $stateName -ErrorAction SilentlyContinue).$stateName -eq 'BLOCK'
  if($desired){
    $existing=Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
    $read=($null -ne $existing -and $existing.Deny_Read -eq 1);$write=($null -ne $existing -and $existing.Deny_Write -eq 1)
    if(($existing.Deny_Read -ne $null -and -not $read -or $existing.Deny_Write -ne $null -and -not $write) -and -not $owned){$verified=$false;continue}
    New-Item -Path $key -Force|Out-Null
    New-ItemProperty -Path $key -Name Deny_Read -PropertyType DWord -Value 1 -Force|Out-Null
    New-ItemProperty -Path $key -Name Deny_Write -PropertyType DWord -Value 1 -Force|Out-Null
    New-ItemProperty -Path $owner -Name $stateName -PropertyType String -Value 'BLOCK' -Force|Out-Null
  }elseif($owned){
    Remove-ItemProperty -Path $key -Name Deny_Read -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $key -Name Deny_Write -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $owner -Name $stateName -ErrorAction SilentlyContinue
  }
  $effective=Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
  $readDenied=$effective.Deny_Read -eq 1;$writeDenied=$effective.Deny_Write -eq 1
  $matches=if($desired){$readDenied -and $writeDenied}else{-not $readDenied -and -not $writeDenied}
  if(-not $matches){$verified=$false}
}
if(-not $verified){@{status='POLICY_FAILED';detail='Conflicting or unapplied Windows removable-storage policy'}|ConvertTo-Json -Compress;exit 0}
# Registry policy values are verified, but device-level access is not probed here.
# Keep the server/dashboard state UNVERIFIED until Windows policy refresh and a
# controlled hardware access test confirm the effective result.
@{status='POLICY_APPLIED_UNVERIFIED';detail='Windows policy registry values match; effective device access has not been independently tested'}|ConvertTo-Json -Compress
