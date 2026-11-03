# Windows Production-Acceptance Procedure

This procedure is for the exact package `CYBERORBIT-Windows.zip` (agent version `1.1.0`, SHA-256 below) on a dedicated Windows 10/11 x64 test machine and a test tenant. Do not run it on an employee's existing device. Use an already enrolled **test** device for the update workflow. A successful run is acceptance evidence for this package and test machine only; it is not protection from a fully privileged local Administrator or SYSTEM principal.

## Test controls

- Take a VM snapshot or equivalent recoverable system image. Use a test employee, test Main Admin and test backend tenant. Keep a separate recovery Administrator account.
- Do not use `reset-incomplete.ps1`, the fresh installer, `-PurgeData`, manual credential deletion, manual queue deletion, or a real employee enrollment token in this existing-device test.
- Run elevated commands only in the dedicated test VM. Run the standard-user checks from the mapped test employee account, which must not be a member of Administrators.
- For each result below, record the actual output and mark `PASS` or `FAIL`. `PENDING` means the Windows-host action has not run. Stop on the first unexpected state and preserve the VM and logs for review.
- Keep the Main Admin session freshly MFA-verified (within 15 minutes) at each approval. Grants expire after two minutes; an unreviewed request expires after 15 minutes.

## Package facts

| Item | Expected / verified value |
|---|---|
| Package | `CYBERORBIT-Windows.zip` |
| Agent package version | `1.1.0` |
| SHA-256 | `a4614ded252ffcdf34a74027bf8c9fbe5d4c84a4d1dd4d7123a54369cd7969c3` |
| Size | `35,011,951` bytes |
| Archive inventory | 69 entries: 68 manifest-listed payload files and `package-manifest.json` |
| Build-host result | SHA-256 and all 68 manifest file hashes verified; Windows package and authorization tests passed |

Set these paths on the test machine before running the commands. Replace the download path and backend URL with the approved test values; never paste a credential or enrollment token into a command.

```powershell
$Zip = 'C:\CYBERORBIT-Acceptance\CYBERORBIT-Windows.zip'
$PackageRoot = 'C:\CYBERORBIT-Acceptance\package'
$ApiBase = 'https://<test-backend-host>'
$ExpectedSha256 = 'a4614ded252ffcdf34a74027bf8c9fbe5d4c84a4d1dd4d7123a54369cd7969c3'
```

## Procedure

### 1. Verify the ZIP before extraction

**Command** (PowerShell):

```powershell
$actual = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $ExpectedSha256) { throw "FAIL: ZIP SHA-256 mismatch: $actual" }
"PASS: ZIP SHA-256 matches $actual"
```

**Expected:** `PASS` and the exact SHA-256 above. Do not extract or install if it differs.

**Actual:** Build-host hash matched. **Windows acceptance host: not run.**

**Status:** `PENDING` on the Windows test machine.

### 2. Confirm the backend and authorization route are deployed

Use the approved test backend URL over HTTPS. `/health` is a process health check; the second request is a non-mutating schema probe that must reach the new endpoint route. Then sign in to the test tenant's Main Admin dashboard and refresh **Admin Management → Local agent operation requests**; a successful list response confirms the authenticated review route and database are available.

**Commands** (PowerShell):

```powershell
$health = Invoke-RestMethod -Method Get -Uri "$ApiBase/health"
if ($health.status -ne 'healthy') { throw "FAIL: API health is $($health.status)" }
$health | Select-Object success,status,service

curl.exe -sS -i -X POST "$ApiBase/api/endpoint/local-operation-requests" `
  -H 'Content-Type: application/json' --data-binary '{"unexpected":true}'
```

**Expected:** API returns `success: true`, `status: healthy`, service `CyberOrbit API`. The route probe returns HTTP `400` with code `LOCAL_OPERATION_REQUEST_INVALID`; `404`, `426`, `503`, or a database error is a failure. The Main Admin request list loads without an error.

**Actual:** Not run; the deployed test-backend URL and deployment evidence were not available during preparation.

**Status:** `PENDING`.

### 3. Verify package contents and extract to a new directory

Run only after Step 1 passes. Do not extract over `Program Files`, `ProgramData`, or an existing package directory.

**Command** (PowerShell):

```powershell
if (Test-Path -LiteralPath $PackageRoot) { throw "FAIL: package directory already exists; inspect it instead of overwriting: $PackageRoot" }
Expand-Archive -LiteralPath $Zip -DestinationPath $PackageRoot
$required = @(
  'CyberOrbitService.exe','runtime/node.exe','packaging/windows/ServiceHost.cs',
  'packaging/windows/install.ps1','packaging/windows/configure-startup.ps1',
  'packaging/windows/request-operation.ps1','packaging/windows/uninstall.ps1',
  'packaging/windows/update-installed.ps1','src/local-operation-auth.js',
  'src/local-operation-client.js','native/windows-uninstall-schedule.ps1'
)
foreach ($relative in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot $relative) -PathType Leaf)) { throw "FAIL: missing $relative" }
}
"PASS: all required Windows authorization/package files are present"
```

**Expected:** All files exist, including the compiled service host, bundled Node runtime, service ACL installer, request helper, updater, uninstaller, grant modules and LocalSystem uninstall scheduler.

**Actual:** The build-host archive test and direct archive inspection passed. Test-machine extraction has not run.

**Status:** `PENDING` on the Windows test machine.

### 4. Confirm the test account is a Standard User

Log in to the mapped test employee account, open **non-elevated** PowerShell, and run:

```powershell
whoami /user
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) { throw 'FAIL: current account/token is an Administrator' }
'PASS: current token is not elevated as a local Administrator'
```

**Expected:** The SID matches the test device's assigned employee mapping; the final line says `PASS`. Do not continue under an account/token that is an Administrator.

**Actual:** Not run on the Windows test machine.

**Status:** `PENDING`.

### 5. Update the existing enrolled test device

Use an already installed and enrolled **test** endpoint. Do not run `install.ps1` or request a new enrollment token for an enrolled device. If the service is running, first submit `SERVICE_STOP` with `request-operation.ps1`, complete its native UAC prompt, obtain fresh Main Admin approval, and wait for SCM to report `Stopped`. The updater must refuse a running service before changing installed files.

Before updating, capture protected data file hashes and ACLs in the same elevated PowerShell session. This prints only a pass/fail result, not credential or queue contents:

```powershell
$DataRoot = Join-Path $env:ProgramData 'CYBERORBIT'
$snapshotData = {
  Get-ChildItem -LiteralPath $DataRoot -Recurse -Force -File |
    Where-Object { $_.Name -notlike 'service.log*' -and $_.Name -ne 'service.lock' -and $_.Name -notlike 'repair-diagnostic-*.json' } |
    Sort-Object FullName |
    ForEach-Object {
      "$($_.FullName.Substring($DataRoot.Length))|$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)|$((Get-Acl -LiteralPath $_.FullName).Sddl)"
    }
}
$beforeData = @(& $snapshotData)
Set-Location $PackageRoot
.\packaging\windows\update-installed.ps1 -ResultFile 'C:\CYBERORBIT-Acceptance\update-result.json'
$updateSucceeded = $?
if (-not $updateSucceeded) { throw 'FAIL: updater returned a failure status' }
$afterData = @(& $snapshotData)
if (Compare-Object $beforeData $afterData) { throw 'FAIL: protected data file inventory, hashes, or ACLs changed' }
$updateResult = Get-Content 'C:\CYBERORBIT-Acceptance\update-result.json' -Raw | ConvertFrom-Json
if (-not $updateResult.success) { throw 'FAIL: updater did not report success; preserve its sanitized result and backups' }
"PASS: code update succeeded; protected data hashes and ACLs are unchanged"
Get-Service CyberOrbitAgent
```

**Expected:** Updater result has `success: true`; the service remains `Stopped`; all existing ProgramData file hashes and ACLs match. Then, from elevated PowerShell, run `Start-Service CyberOrbitAgent` and verify it reaches `Running`. In the Main Admin Devices view, the same device ID remains enrolled and reports a newer agent version/heartbeat. No token is issued or consumed, and no re-enrollment occurs.

**Actual:** Not run on a Windows test machine.

**Status:** `PENDING`.

### 6. Verify direct Standard User stop attempts are denied

From the non-elevated Standard User session, run each command separately and record its output and service state.

**Commands:**

```powershell
$before = (Get-Service CyberOrbitAgent).Status
$denied = $false
try { Stop-Service -Name CyberOrbitAgent -ErrorAction Stop } catch { $denied = $true; "Observed: $($_.Exception.Message)" }
$after = (Get-Service CyberOrbitAgent).Status
if (-not $denied -or $before -ne 'Running' -or $after -ne 'Running') { throw "FAIL: Stop-Service result/state was denied=$denied, before=$before, after=$after" }
'PASS: Stop-Service was denied; service remains Running'

$scOutput = & sc.exe stop CyberOrbitAgent 2>&1
$scCode = $LASTEXITCODE
$scOutput
if ($scCode -eq 0 -or (Get-Service CyberOrbitAgent).Status -ne 'Running') { throw 'FAIL: sc.exe stop was not denied or service stopped' }
'PASS: sc.exe stop was denied; service remains Running'
```

**Expected:** Both attempts are denied (normally Windows error 5 / Access is denied); `CyberOrbitAgent` remains `Running`.

**Actual:** Automated ACL assertions passed. Direct Windows SCM attempts have not run.

**Status:** `PENDING` on Windows.

### 7. Submit and approve a `SERVICE_STOP` request

Still signed in as the Standard User, submit a request:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramFiles\CYBERORBIT\packaging\windows\request-operation.ps1" -Action SERVICE_STOP -Reason 'Dedicated VM service-stop acceptance test'
```

**Expected:** Native Windows UAC appears and requests an Administrator account/password because this test account is standard. CYBERORBIT does not read or validate the password. If UAC is cancelled, command exits nonzero and no request or state change occurs. If accepted, a request ID/status `AUTH_REQUESTED` is returned and service remains `Running`. Main Admin opens the local agent operation requests, checks the test device and action, re-authenticates with fresh MFA, then approves. After the device validates the grant, its service becomes `Stopped`.

**Actual:** Automated Main Admin fresh-MFA `SERVICE_STOP` integration coverage passed in this environment. The Windows request and actual SCM stop have not run.

**Status:** `PENDING` on Windows.

To continue later checks, a test-machine Administrator may explicitly start the service:

```powershell
Start-Service CyberOrbitAgent
Get-Service CyberOrbitAgent
```

Expected: `Running`. This local Administrator action is outside the Main Admin authorization system.

### 8. Verify rejection and expiration

Submit another `SERVICE_STOP` request as the Standard User using the command in Step 7. In Main Admin, reject it with a review reason.

**Expected:** Request becomes `AUTH_REJECTED`; no grant is delivered; service remains `Running`.

For expiry, submit a fresh request and do not review it. Wait beyond its `expiresAt` (15 minutes from request creation), refresh the request list, and attempt approval with fresh MFA.

```powershell
Start-Sleep -Seconds 901
```

**Expected:** Request is `AUTH_EXPIRED`; approval is refused; service remains `Running`.

**Actual:** Rejection and expired-approval denial are covered by automated backend integration tests. Manual Windows cases have not run.

**Status:** `PENDING` on Windows.

### 9. Verify replay, wrong-device and wrong-action protections

Run from the repository root in the approved test/CI environment, not against the employee machine. These tests use isolated fixtures and synthetic credentials; do not copy or edit a live grant file.

```powershell
node --test --test-concurrency=1 agent/test/local-operation-auth.test.js server/test/endpoint-agent-stop.test.js server/test/endpoint-agent-uninstall.test.js
```

**Expected:** All tests pass. They verify action/device/identity-bound signatures, rejection of a wrong device credential, one-use completion/replay denial, rejection and expiry without grant delivery, and fresh-MFA review.

**Actual:** The focused combined authorization suite passed: 10 tests, 0 failures. The wrong-action and replay checks are automated; do not attempt to move a grant between real devices.

**Status:** `PASS` for automated checks; manual cross-device grant tampering is intentionally not performed.

### 10. Verify ordinary users cannot change ACLs or uninstall

From the Standard User session, run this safe ACL probe. It requests the installer's **existing** service DACL, so even an unexpected success would not loosen the ACL; success is nevertheless a test failure because a Standard User must not be able to set it. Compare `sdshow` before and after.

```powershell
$expectedDacl = 'D:P(A;;0xF01FF;;;SY)(A;;0xF01FF;;;BA)(A;;0x2008D;;;BU)'
$beforeAcl = (& sc.exe sdshow CyberOrbitAgent 2>&1 | Out-String).Trim()
$setOutput = & sc.exe sdset CyberOrbitAgent $expectedDacl 2>&1
$setCode = $LASTEXITCODE
$afterAcl = (& sc.exe sdshow CyberOrbitAgent 2>&1 | Out-String).Trim()
if ($setCode -eq 0 -or $beforeAcl -ne $afterAcl) { throw 'FAIL: Standard User could set or changed the service DACL' }
'PASS: Standard User cannot set the service DACL; DACL is unchanged'

$uninstall = "$env:ProgramFiles\CYBERORBIT\packaging\windows\uninstall.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $uninstall
```

The native UAC prompt should request Windows Administrator credentials. Cancel it first and verify no files, credentials, queue, task, service state or request record changed. Retry and provide test-machine Administrator credentials; then enter `Standard user denial acceptance check` if prompted. This invocation only requests Main Admin review and remains non-destructive.

**Expected:** `sc.exe sdset` is denied and before/after DACLs match. UAC cancellation changes nothing; after successful UAC, the uninstaller reports a pending Main Admin request and explicitly says no files, credentials, queues, tasks or service settings changed. Service and installed files remain. Do not approve this request; reject it in Main Admin.

**Actual:** Automated service ACL and native-UAC launch-path assertions passed. Actual Windows UAC and permission checks have not run.

**Status:** `PENDING` on Windows.

### 11. Verify `AGENT_UNINSTALL` approval, revocation ordering and data retention

As the Standard User, submit an uninstall request using the request helper:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:ProgramFiles\CYBERORBIT\packaging\windows\request-operation.ps1" -Action AGENT_UNINSTALL -Reason 'Dedicated VM authorized uninstall acceptance test'
```

Main Admin verifies the device ID/action, completes fresh MFA, and approves with an audit reason. Wait for the LocalSystem scheduled task to finish. Do not pass `-PurgeData`.

**Expected:** The request and approval alone do not revoke the device. The request is approved and a device/action-bound grant is delivered. The LocalSystem executor validates it, stops the service, and only after confirmed stop posts completion. The backend request reaches `AUTH_COMPLETED`; the server credential is revoked (`credentialHash` cleared and `revokedAt` set); then the service/tasks and Program Files installation are removed. In the current workflow, revocation is confirmed after service stop but before local file/task cleanup. If that later cleanup fails, report the partial uninstall; do not reactivate or re-enroll the device. `C:\ProgramData\CYBERORBIT` and local enrollment/queue files are retained because `-PurgeData` was not supplied. Record backend audit/request status and verify the request/revocation timeline.

**Actual:** Automated `AGENT_UNINSTALL` end-to-end test passed: fresh-MFA approval, signed grant, successful completion, server credential revocation, and replay denial. Actual Windows Task Scheduler/SCM/file removal has not run.

**Status:** `PENDING` on Windows.

### 12. Verify telemetry and enrollment remain intact through update

Perform this before the authorized uninstall in Step 11. After the update and any authorized stop test, start the service as the test-machine Administrator if needed, sign in as the mapped test employee, and launch a benign test application:

```powershell
Start-Service CyberOrbitAgent
Start-Process notepad.exe
Start-Sleep -Seconds 30
Stop-Process -Name notepad -ErrorAction SilentlyContinue
Get-Service CyberOrbitAgent
```

**Expected:** Service is `Running`; the same enrolled test device ID remains in the dashboard, its heartbeat advances, and a test application-usage event appears for the mapped test user. The update did not consume an enrollment token or replace the credential/queue data. Record the event time and device ID, not sensitive employee data.

**Actual:** Not run on the Windows test machine.

**Status:** `PENDING`.

## Administrator boundary and acceptance record

The service DACL and protected installation/data ACLs block ordinary Users. They do not defend against a fully privileged Windows local Administrator or SYSTEM. Such a principal can change service/task ACLs, stop the process, replace protected files, access LocalMachine-protected material, alter the OS, or delete local data. Main Admin approval is an application-level authorization workflow, not a replacement for Windows Administrator authority. Do not claim otherwise.

Before accepting this package, complete every Windows `PENDING` step on the dedicated test machine, retain sanitized command outputs and backend audit IDs, and record the Windows edition/build, package SHA-256, test device ID, operator, date, and pass/fail result. Any unexpected stop, data/ACL change, premature credential revocation, or missing audit record is a failure; preserve the machine state and do not retry by purging or reenrolling.

| Acceptance field | Value |
|---|---|
| Test machine / Windows build | Pending |
| Test device ID | Pending |
| Test backend deployment/revision | Pending |
| Package SHA-256 verified on test machine | Pending |
| Operator / date | Pending |
| Final result | Pending |
