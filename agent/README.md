# CYBERORBIT endpoint monitoring

## Application activity timeline (1.0.8)

Devices now defaults to **Application activity (start / active / stop)**. The
same scoped dashboard API combines independent latest-150 application and
latest-150 process streams, so process churn cannot remove all foreground
records. Cards group by available Windows app ID, otherwise process name.
Totals refer only to loaded records, not lifetime usage. Background-only
processes display no recorded foreground usage instead of claiming active use.

`APPLICATION_FOREGROUND` records the first eligible desktop sample, app switch,
or return after idle, lock or a sampling gap. It does not require a 30-second
duration flush. `APPLICATION_USAGE` continues to report measured durations.
Process records distinguish start observed, stop observed and already-running
snapshots; available OS process-start time is displayed separately. Process
creation is not equivalent to opening a visible window. Two-second desktop
sampling and process polling can miss brief activity. No claim of exhaustive
capture or exact window-open/close timestamps is made.

Restart the updated backend, then run the existing installed-code updater from
an Administrator terminal. Agent 1.0.8 emits a new event type and process app IDs;
an older backend cannot accept them. Enrollment, credentials and queued data are
preserved. No additional database migration is required. Test an arbitrary app
in the employee session, switch away, and select its card to inspect foreground,
usage and available process observations. This does not enable OS account
control or expand browser-title consent.

## Windows hosted app identification (1.0.7)

Foreground usage resolves a unique visible child process inside an
ApplicationFrameHost/WWAHost window, restricted to the helper's Windows session.
Processes with their own Windows application identity retain that identity.
The collector queries the process AppUserModelID and matches it to the current
user's Windows Start-app catalog for a display name. The catalog refreshes every
five minutes. This uses OS app metadata, not window titles or page contents.

Usage metadata now optionally carries `appId`, `appName`, `hostName` and
`identitySource`, while retaining the real process name and PID. Different app
IDs split usage even when a host PID is reused. Dashboard cards use app IDs for
grouping. If access is denied or multiple visible child processes make resolution
ambiguous, the host is retained and labelled unresolved; an app is never guessed
from a list of running processes. Old host-only records cannot be backfilled.
No foreground window now produces an empty process name rather than an Idle app.

Restart the backend before updating the installed agent with the existing
`update-installed.ps1` command; otherwise the previous event validator rejects
new metadata fields. No database migration or re-enrollment is needed. Validate
Calculator, Clock and other installed apps in the employee's interactive session,
then check new usage events for the app identity and display name. Compilation
and synthetic contract checks do not prove every Windows app is resolvable.

API reference: [GetApplicationUserModelId](https://learn.microsoft.com/windows/win32/api/appmodel/nf-appmodel-getapplicationusermodelid).

## Windows employee sign-in freeze (1.0.6, opt-in)

This feature controls an **existing local standard Windows account**, mapped by
the enrollment SID. It does not create accounts, assign Windows passwords, or
give employees CYBERORBIT console access. Provision the employee and separate
recovery administrator using Windows administration. Log into the recovery
administrator successfully before enabling this feature. Never map the personal
administrator account used to develop this project as the employee.

FROZEN employee status produces a BLOCK instruction in the authenticated device
heartbeat. ACTIVE produces ALLOW; other statuses HOLD the existing OS state.
This includes status changes from the existing policy pipeline, not only manual
buttons. Backend company/role checks and existing freeze/unfreeze auditing remain
in effect. Device credentials remain usable while the employee is frozen, so the
LocalSystem agent can receive unfreeze without the employee logging in.

The local helper refuses an administrator employee, built-in account, mismatched
SID, nonlocal account, domain-joined computer, ambiguous administrator group
membership, disabled/expired recovery administrator or unsafe journal storage.
It never changes the recovery administrator. Supported operations are
[Disable-LocalUser](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.localaccounts/disable-localuser?view=powershell-5.1),
Enable-LocalUser and SID-scoped WTS session logoff. Signing out can lose unsaved work.

From repository root, in Administrator PowerShell, after restarting the updated
backend:

```powershell
# Existing installation: preserve enrollment, credentials, configuration and queue.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\agent\packaging\windows\update-installed.ps1

# Discover Windows account SIDs locally; never paste passwords into CYBERORBIT.
Get-LocalUser | Select-Object Name, Enabled, SID

# Substitute the actual employee and recovery-admin SIDs. CHECK ONLY:
.\agent\packaging\windows\configure-account-control.ps1 -EmployeeSid '<employee-SID>' -RecoveryAdminSid '<recovery-admin-SID>'

# Only after testing recovery-admin login and verifying the dashboard's SID mapping:
.\agent\packaging\windows\configure-account-control.ps1 -EmployeeSid '<employee-SID>' -RecoveryAdminSid '<recovery-admin-SID>' -Enable -RecoveryLoginVerified

# Save employee work first. An already-FROZEN employee will be signed out.
Restart-Service CyberOrbitAgent
```

Use Employee Management FREEZE / UNFREEZE. Devices displays the last
`windowsAccount` report, separately from the application account status:
`BLOCKED` means disabled with no matching sessions observed; `LOGOFF_PENDING`
means disabled while session termination is still pending; `ALLOWED` means
enabled. `UNSAFE_ACCOUNT`, `UNSAFE_RECOVERY`, `UNSUPPORTED_MACHINE`, or an error
mean enforcement was refused/failed, not confirmed. `EXTERNALLY_DISABLED` means
the agent did not disable the account and will not re-enable it automatically.
Allow two heartbeats for execution and reporting. An offline or stale device
cannot confirm current enforcement. No server shutdown or laptop shutdown occurs.

Offline: a previously applied disable persists across reboot. New freeze or
unfreeze commands require connectivity. Commands are applied only from a fresh
authenticated heartbeat; cached telemetry/configuration never authorizes OS
changes. Do not revoke/uninstall a frozen device expecting remote unfreeze to
still work. Local administrator recovery remains possible.

For localhost development, do not run the backend in the employee session being
frozen: signing out ends that session's Node server too. Run the backend on a
separate server or independently in the administrator/service context. The
dashboard must remain reachable by the administrator for remote unfreeze.

Recovery: sign into the separate administrator, stop CyberOrbitAgent, set
`windowsAccountControl.enabled` to false in the installed agent-config.json,
and use Windows Local Users and Groups or `Enable-LocalUser -SID '<employee-SID>'`
to restore the verified employee account. Preserve the protected journal
`C:\ProgramData\CYBERORBIT\windows-account-control.json` for diagnosis. A
PREPARED/corrupt/mismatched journal reports RECOVERY_REQUIRED and is never treated
as permission to enable an externally disabled user. After recovery, archive
that journal as administrator before re-enabling management with the correct
mapping. Restart the service after configuration changes.

Validation performed: isolated API database tests for freeze/unfreeze heartbeat
instructions and revocation, JavaScript refusal/identity tests, C# compilation,
and PowerShell syntax checks. **Real disable/sign-out/reboot/unfreeze and recovery
must be tested on a disposable Windows machine with two verified accounts before
production use.** No existing account was disabled during development. AD/Entra
identity control, Linux and macOS login enforcement are not implemented.

## Optional Windows browser titles

The desktop helper can collect the foreground window title for Chrome, Brave,
Edge and Firefox. Enable `browserTitles: true` in the installed
`C:\Program Files\CYBERORBIT\agent-config.json` using an administrator editor,
then enable **Browser titles** on that device in the dashboard. Both approvals
are required for upload. It defaults off. Restart the desktop helper and service
after changing local approval. The helper prints a monitoring notice.

Update the backend first (it validates the shared contract), then update existing
agent code with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File
.\agent\packaging\windows\update-installed.ps1` from the repository root in an
administrator terminal. This code updater preserves enrollment and queue data;
do not reinstall or revoke. It does not change local monitoring approval.

Titles appear inside APPLICATION_USAGE entries and split duration when the
sampled title changes, including switches between tabs in the same browser.
Sampling is every two seconds, with the existing idle/lock exclusions and
30-second flush. Identical titles cannot distinguish two tabs. Short visits
between samples can be missed. Old events have no title and cannot be enriched.

This is OS window-title metadata, not verified browsing history or a description
of user actions. No URL, domain, page body, screenshots, form input, passwords or
message contents are read. Page titles themselves may contain sensitive search
terms or private page names. OS title sampling cannot reliably identify private
browsing windows, so they are included when this option is enabled. Disable local
approval to stop native title collection; dashboard disabling stops upload after
the next configuration heartbeat. Previously stored events are retained.
Other platforms continue reporting application usage without titles.

Current source package: **1.0.8**, adding opt-in Windows local-account control alongside optional browser titles. The 1.0.4 queue recovery improvements remain included. Source changes do not update an installed agent automatically; use the installed-code updater described above. No live installation or dashboard verification is implied by this source version.

JavaScript agent, independent of the website. The Windows package includes Node; employees need neither Node nor VS Code. New telemetry is stored in PostgreSQL endpoint tables, not the legacy in-memory activity buffer. Existing risk/trust/policy/incident processing is preserved; the endpoint panel displays its results without inventing an endpoint ML prediction.

## Repository assessment

Express (`server/server.js`, router `server/routes/index.js`), PostgreSQL/Prisma, MFA-verified bearer JWTs, React and SSE. The repository already contained uncommitted `EndpointDevice`, `EndpointEvent` and company schema additions; these are reused. A pre-existing empty `20260918000000_remove_default_risk_scores` migration directory is repaired with a no-op SQL file so deployment preserves existing risk defaults. Endpoint routes fail closed if durable PostgreSQL is unavailable.

## Backend setup

From the repository root, with the existing database/JWT environment configured:

```powershell
node node_modules/prisma/build/index.js generate
node node_modules/prisma/build/index.js migrate deploy
node server/server.js
```

The endpoint migration adds company membership (existing users receive `legacy`) and separate enrollment/device/event tables. Set real company IDs through trusted provisioning before operating multiple companies; do not use the `legacy` default as tenant onboarding. The subsequent master-prompt update adds company isolation to the mounted application resource, policy, incident, audit and user APIs; see `docs/IMPLEMENTATION_AUDIT.md`. Endpoint stored data, assignment, configuration, revocation and live notifications are company scoped.

Production: terminate HTTPS at a trusted reverse proxy. For a **same-host** proxy, set `TRUST_PROXY=loopback` and forward `X-Forwarded-Proto: https`. Keep backend port inaccessible from the external network. This is explicit trust of loopback proxies only. Agent TLS certificate validation remains enabled. Use a publicly trusted certificate or distribute your enterprise CA (e.g. `NODE_EXTRA_CA_CERTS` to the service environment). Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`.

Local development only: set `ENDPOINT_ALLOW_LOOPBACK_HTTP=true` on a non-production backend, and supply `-AllowLoopbackHttp` to the installer with `http://127.0.0.1:3000`. Hostnames, LAN addresses and redirects are rejected for this exception. HTTP is still rejected by the backend in `NODE_ENV=production`.

## Windows build, assignment and installation

Target: Windows 10/11, x64 package when built with x64 Node. Build machine needs Node >=22, Windows PowerShell 5.1 and the Windows .NET Framework C# compiler. The default script includes the current build machine's Node executable; pin `-NodeExe` to a reviewed runtime binary for release builds. A SHA256 build manifest and file list accompany the package. No runtime downloads occur on employee laptops.

```powershell
# From repository root on the build machine:
powershell -NoProfile -File agent\packaging\windows\build.ps1
# Optional runtime pin:
powershell -NoProfile -File agent\packaging\windows\build.ps1 -NodeExe C:\BuildTools\node-v24.20.0-win-x64\node.exe
# The build also refreshes agent/dist/install-kit after checking it has no local state.
```

1. Verify the employee's Windows SID **on the assigned laptop**, in their session: `whoami /user`. Match the directory account to the employee before mapping it. A shared account is not a verified employee identity.
2. In the administrator **Devices** page, choose an existing unenrolled device or Register a new laptop, select the employee, laptop name and Windows, and enter that verified SID. Click **Assign** to save, then **Issue Enrollment Token** for that assigned device. The company is derived from the authenticated administrator, not the form. Tokens expire after 15 minutes, are displayed once with Copy/Dismiss controls and stored only as hashes. Issuing another token invalidates the previous one. Without a mapping all activity remains device/unmapped activity, visible to administrators.
3. Copy/extract the package to the laptop. Run the following in **elevated Windows PowerShell**. Enter the token at the hidden prompt; do not place tokens on the command line or in transcripts.

```powershell
Set-Location C:\Install\CYBERORBIT
powershell -NoProfile -File .\packaging\windows\install.ps1 -ServerUrl https://cyberorbit.example.com
# Optional local consent/approval for file changes (also enable the SAME paths in dashboard):
powershell -NoProfile -File .\packaging\windows\install.ps1 -ServerUrl https://cyberorbit.example.com -ApprovedDirectory 'C:\Company\Approved'
```

Installation writes to `C:\Program Files\CYBERORBIT` and `C:\ProgramData\CYBERORBIT`. It enrolls the device, installs `CyberOrbitAgent` as an automatic LocalSystem service with restart-on-failure, and registers a **visible** limited-privilege desktop task for the assigned SID. It starts the service immediately; log off/on for the desktop helper. Files/code/config cannot be modified by ordinary users. SYSTEM/Administrators can access device credentials and queue; the mapped SID can read only its helper capability file and traverse the data root. DPAPI LocalMachine protection depends on these ACLs: machine protection alone is not a user isolation boundary.

### Retry an incomplete Windows enrollment

Agent 1.0.3 validates the token before staging installation files, uses the same request validator as the backend and reports bounded sanitized backend errors with a correlation request ID. The payload is exactly `{token,platform:"win32",agentVersion:"1.0.3"}`; it contains no employee/company identity. Do not supply a JWT, SID, device ID, quoted string, label or JSON at the token prompt.

The former `[endpoint] POST /enroll status 400 code Error` came from `Invalid enrollment` before token lookup, but did not retain the failing field. The old agent suppressed the response body. It is impossible to recover the original field/value from that log alone. Schema failures now identify `token`, `platform`, `agentVersion` or `payload` in server logs, with static reasons and a request ID; supplied values are never logged. Invalid format is 400; expired/replaced/used/revoked tokens are 401. Used/replaced/revoked token hashes are erased, so those states intentionally share a message when no matching pending record remains. Correctly formatted tokens are still required to match an active, same-company employee assignment, platform, expiry and an atomic single-use update.

1. Restart the backend **once** to load the fix: Ctrl+C in its terminal, then `npm start` from `server/` (or `npm run dev` from the root). On localhost the explicit loopback-development configuration remains required; no TLS verification is disabled. If the fix has already been loaded, keep the existing backend instead of launching a duplicate.
2. In Devices, review the device. For **UNENROLLED** Windows assignments, use the existing record. A revoked record requires a new assignment. If it is already enrolled or local data exists, preserve local data and use the normal dashboard revocation/uninstall process before a new assignment. Do not blindly purge credentials or a queue.
3. Build the new runtime-inclusive package. From the repository root in **elevated PowerShell**, inspect and remove only an empty incomplete installation:

```powershell
Set-Location 'C:\Users\priya\OneDrive\Desktop\capstone'
npm run agent:build:windows
powershell -NoProfile -File .\agent\dist\windows\packaging\windows\reset-incomplete.ps1 -InspectOnly
powershell -NoProfile -File .\agent\dist\windows\packaging\windows\reset-incomplete.ps1
```

The reset script validates fixed OS installation paths, refuses reparse points, services/tasks and **any** local data, and removes only recognized staging binaries/configuration plus the empty data directory. It does not revoke credentials or change backend records. A refusal is a reason to preserve/review the installation, not to bypass its safeguards. Run it from the new package outside `C:\Program Files\CYBERORBIT`.

4. Select that UNENROLLED device in Devices and click **Issue Enrollment Token**, then **Copy token**. A fresh token replaces any previous one and expires after 15 minutes. Immediately run:

```powershell
powershell -NoProfile -File .\agent\dist\windows\packaging\windows\install.ps1 -ServerUrl http://127.0.0.1:3000 -AllowLoopbackHttp
Get-Service CyberOrbitAgent
```

Paste only the token into the hidden prompt. Service/task entries are created only after exchange and protected local persistence succeed. If enrollment fails, the error contains a safe code/message/request ID. Match the ID to the backend log, review the dashboard state, and do not repeatedly consume tokens. If the server accepted enrollment but response validation or local persistence failed, the agent explicitly says so: preserve local state, revoke the enrolled record and create a new assignment. A nonempty data directory cannot be reenrolled automatically. Log off/on for the session helper after successful installation; the service itself starts immediately. No employee Node installation is required.

### Repeated token-format failures / existing install-kit

The original extracted `agent/dist/install-kit` was still agent 1.0.0 even after the ZIP and `dist/windows` were rebuilt. `build.ps1` now also refreshes the extracted kit after checking it contains no credentials/configuration/queue state or reparse points. It updates package files only; it does not modify `Program Files`, `ProgramData`, backups or the running backend. Agent 1.0.2 includes `-TokenFromClipboard` to avoid terminal secure-input paste problems. An invalid input reports only its character count, never its value, and stops before staging files or sending enrollment.

For the user's existing kit, run elevated after confirming the dashboard device is UNENROLLED:

```powershell
Set-Location 'C:\Users\priya\OneDrive\Desktop\capstone\agent\dist\install-kit'
.\packaging\windows\reset-incomplete.ps1 -InspectOnly
.\packaging\windows\reset-incomplete.ps1
.\packaging\windows\install.ps1 -ServerUrl 'http://127.0.0.1:3000' -AllowLoopbackHttp -TokenFromClipboard
```

The last command waits. While it waits, click **Issue Enrollment Token**, then **Copy token** in Devices. Return to PowerShell and press **Enter without pasting or typing the token**. The installer reads clipboard text and validates exactly 43 permitted characters; quotes, labels, JSON, asterisks and blank input fail locally. Waiting after command entry avoids accidentally replacing the token by copying the install command. The default hidden-input prompt is still available without the switch. If reset refuses nonempty data or startup entries, preserve them and follow the normal review/revocation/uninstall path. Existing `.backup-*` folders are left untouched. Keep the user's VS Code backend running; another backend is not started by these commands.

### Installed service native-helper repair (1.0.3)

The enrolled service reads `credential.dpapi` through `vault.ps1` before starting collectors. Native failures now report only the helper basename, exit code and a controlled category; bounded stderr is classified and never printed. PowerShell helpers use an explicit **child-process-only** execution policy argument, covering the service and desktop helper. No persistent policy is changed, Group Policy still overrides it, and DPAPI remains LocalMachine. Signed production distribution remains required. Startup failures also release the agent's own service lock.

To update an enrolled installation, keep the existing backend running and run the prepared code-only updater in elevated PowerShell:

```powershell
Set-Location 'C:\Users\priya\OneDrive\Desktop\capstone\agent\dist\install-kit'
.\packaging\windows\update-installed.ps1
```

It checks service identity/paths, stops only CyberOrbitAgent, backs up and updates six code files in place, preserving existing file ACLs. It never replaces the runtime, service host, configuration, DPAPI files, queue, enrollment or scheduled desktop startup task. A temporary protected-code LocalSystem task compares the original and fixed vault invocation and checks the system collector, saving only sanitized results. This diagnostic task is allowed to run on battery and is removed afterward. Encrypted data hashes and ACLs are compared before service restart; they are never printed. The service must remain running for 40 seconds or the updater restores old code and reports failure. Code backups and protected diagnostic reports remain for review. A failed repair must not be treated as successful startup. Use the device dashboard/backend lastSeen and agentVersion to verify a new heartbeat; the probe itself never sends one.

```powershell
# Inspect / start / stop service (elevated):
Get-Service CyberOrbitAgent
Start-Service CyberOrbitAgent
Stop-Service CyberOrbitAgent
# Start desktop helper now, from the ASSIGNED EMPLOYEE's ordinary session:
& 'C:\Program Files\CYBERORBIT\runtime\node.exe' 'C:\Program Files\CYBERORBIT\src\cli.js' helper 'C:\Program Files\CYBERORBIT\agent-config.json'
# Optional service foreground diagnostic run, elevated and only after stopping the service:
& 'C:\Program Files\CYBERORBIT\runtime\node.exe' 'C:\Program Files\CYBERORBIT\src\cli.js' service 'C:\Program Files\CYBERORBIT\agent-config.json'
```

The helper's terminal tells the employee monitoring is enabled; closing it stops desktop sampling but keeps the service/device collectors running. Administrator **Pause collectors** stops observations while health/configuration continue. Configuration polling is every 30 seconds online. Collector toggles are also available with `PUT /api/endpoint/:id/config`; the dashboard supports pause, TCP metadata and approved directories. File monitoring requires the exact directory in both server configuration and local `locallyApprovedDirectories`. Configurations persist for offline operation. No directory is monitored by default.

Permissions: service administrative access for process owner tokens, WTS/CIM and optional TCP enumeration; desktop helper ordinary interactive rights. Protected processes may withhold owner/start-time data and remain unattributed. Antivirus/application-control policy must allow the included Node binary, C# host and PowerShell helpers. Do not disable security controls; production should sign and explicitly allow reviewed binaries/scripts.

## Revoke, uninstall and reassignment

Revoke in the administrator endpoint panel (`POST /api/endpoint/:id/revoke`). Credential and unused enrollment token become unusable immediately on the server; the service stops collection when it receives 401/403. An offline device cannot learn a revocation until reconnecting; stop/uninstall locally if immediate local cessation is required. Revocation keeps server history and does not lock the OS. Reassignment requires revocation, removal and a new enrollment/identity mapping; an enrolled configuration cannot silently enroll again.

Copy the uninstall script outside the installation directory before removal:

```powershell
Copy-Item -LiteralPath 'C:\Program Files\CYBERORBIT\packaging\windows\uninstall.ps1' -Destination "$env:TEMP\cyberorbit-uninstall.ps1"
powershell -NoProfile -File "$env:TEMP\cyberorbit-uninstall.ps1"
# Add -PurgeData only when you intend to discard retained queue/credentials.
```

Run elevated. It removes service/task/code, retains protected data by default, and does not replace backend revocation. Preserve/export the queue if it needs investigation; after revocation it cannot upload. The installer refuses to overwrite old data. Review and remove the explicitly named retained `C:\ProgramData\CYBERORBIT` directory before a fresh assignment.

## Collection semantics and limits

| Collector | Windows | Linux | macOS | Limits |
|---|---|---|---|---|
| Health | Node OS APIs, 30s heartbeat | Same | Same | Health reflects reports, not OS enforcement |
| Processes | Native process enumeration + process token SID, polling | `/proc` UID/start ticks, polling | `ps` UID/start time, polling | `PROCESS_RUNNING` initially/every five minutes; starts/stops are snapshot differences, short processes/PID reuse with unknown start time can be missed |
| Application usage | Desktop helper: GetForegroundWindow, GetLastInputInfo, WTS lock state, 2s polling | X11 `xprop` PID + `xprintidle`, 2s polling | Native Swift NSWorkspace + idle time, 2s polling | Duration approximates sampled foreground activity while idle <60s; gaps >5s are not counted. Running background processes are never treated as foreground use. No titles/URLs/command lines |
| Sessions | WTS session snapshots; helper polls actual WTS lock/unlock | loginctl snapshots / LockedHint | Not implemented | Initial state is `SESSION_STATE`, not a fabricated login. Windows disconnect/reconnect uses state events; logouts between samples may be missed. Only assigned SID's helper can report lock changes |
| USB | Present Win32_PnPEntity USB nodes, CIM polling | sysfs USB nodes, polling | system_profiler USB tree, polling | Current devices initially reported; connection/removal observations, not transfers or file reads. Can miss rapid reconnects; composite nodes may yield multiple observations |
| File change | Node fs.watch OS notifications, per-directory recursion | Same | Same | Approved roots only, no file contents. Symlinks are not followed; up to 2,000 directories. Rename is ambiguous create/delete/rename; not reads. Notifications may coalesce/drop; new directory races/network mounts can miss changes |
| Network | Get-NetTCPConnection snapshots | `ss` TCP snapshots | lsof established TCP snapshots | Optional, TCP only, no browsing history/DNS/payload/bytes. May miss short connections; visibility depends on privileges |

Collector errors are reported independently; a failure does not invent events or suppress all other sources. The MVP uses polling for process/session/USB/network and OS change notifications for files. Physical USB insert/remove, fast-user switching/RDP, actual lock/logout transitions, reboot, service/task installation, recovery and ACL behavior under a second user still require administrator acceptance testing on the target laptop. The automated Windows suite queries actual APIs and desktop state without disrupting the user's session.

The capability-authenticated helper channel binds only to `127.0.0.1:47731`. Each request and response has HMAC authentication with a random secret, timestamps and replay nonces; secret capabilities have OS access controls. No device credential or queue key reaches the helper. A compromised mapped user can forge their own helper observations; a compromised local administrator/service or stolen device credential can forge device telemetry. This is not hardware attestation or tamper-proof evidence.

No passwords, keystrokes, screenshots, messages, window contents or file contents are collected. File names, process names, OS identities and network addresses remain sensitive metadata and should be covered by the organization's employee notice/retention policy.

## Event delivery and retention

Schema: `{version:1,eventId:UUID,deviceId:UUID,occurredAt:UTC_ISO,type,metadata}`. The shared contract in `shared/contract.js` validates types and minimal whitelisted metadata. Agent company/employee fields are rejected inside events. Backend credentials select the enrollment/device; only a matching administrator-mapped SID/UID attributes process/session/application activity. USB/file/network/health remain device observations. Multiple sessions never automatically become the assigned employee's activity.

HTTPS batches: at most 100 events and 240KB client/256KB server; 15s request timeout; exponential full jitter plus a 1s floor, capped around five minutes; redirects rejected. A unique `(deviceId,eventId)` index provides deduplication. Acknowledgment is returned only after PostgreSQL transaction commit. Partial acknowledgments remove only those IDs. Endpoint ingestion fails closed rather than using the legacy Prisma memory fallback.

Queue: one AES-256-GCM authenticated encrypted record per event, with a separately OS-stored random key; encrypted drop statistics; atomic fsynced file writes; complete temporary files recovered after restart. Default limits: 50MiB encrypted event data, 50,000 records, seven days. Oldest inserted records overflow first; expired and corrupt records are discarded and counted. Disk-write failure stops successful collection for that observation and reports collector errors. Statistics corruption fails closed for manual recovery. Queue/decrypted records remain only on the endpoint and bounded in memory; the remote dashboard catches up after connectivity returns. OS/filesystem sudden-power-loss guarantees still require target-system testing. Server history has no automated TTL in this MVP; add retention jobs according to deployment policy.

Health gives queue bytes/count, lifetime dropped count, collector status, version and helper last seen. Dashboard statuses: CONNECTED through 90 seconds, STALE through five minutes, then OFFLINE; revoked/unenrolled shown separately. SSE uses short-lived HttpOnly tickets, user/company-scoped dispatch, five-minute stream expiry and 25s account status revalidation. Existing authenticated polling remains a fallback.

## Finding application usage

The admin Devices panel and employee dashboard default to **Application usage**. The existing `/api/endpoint/dashboard` route accepts `eventType=APPLICATION_USAGE` and applies that filter before its 150-row database limit. **All activity** retains the process/session/device timeline. A limit notice identifies truncated results; older rows remain in PostgreSQL. Employee and company authorization apply to both views. The unfiltered API remains compatible with existing callers.

Application names and per-observation foreground duration appear prominently. Use the **Application** picker or click an application summary card to isolate Notepad, Brave or another observed app. Summaries and the picker cover only the currently loaded events; summed seconds are not daily totals. Technical metadata remains available in collapsed **Technical details**. Unattributed observations do not display an assigned employee as their actor.

Names are the OS process names, including `Notepad` and `brave`; there is no Chrome-only allowlist. Usage comes only from the authenticated desktop-session helper, not from process snapshots. Two-second sampling needs consecutive observations, and short foreground visits can be missed. An application switch or approximately 30 seconds of accumulated active usage flushes an event. Locked sessions, input idle of 60 seconds or more, and sample gaps longer than five seconds are excluded. Allow upload and dashboard refresh time before checking the timeline.

After changing the backend route, restart the existing VS Code backend with Ctrl+C then `npm start` from `server/`; refresh the page and choose Application usage. No agent reinstall, token exchange or credential revocation is involved in this dashboard fix. Run `npm run test:usage` after building the frontend to exercise the real HTTP/browser regression using explicitly isolated test fixtures.

## ML compatibility

The checked-in random forest and inference loader require the ordered 21 features in `ml/models/multi_source_feature_schema.json`, across CERT logon/device/file/HTTP/email user-day records. Training code and complete preprocessing/timezone semantics are not included. Existing `ml-feature-aggregator.js` is inspected but cannot safely make endpoint events equivalent: it defaults unknown types to file events and fills missing sources with zeros. USB connection is not USB transfer, filesystem change is not read/content access, TCP metadata is not URL/HTTP content, and email/content features are deliberately unavailable.

Therefore endpoint inference is unavailable, not a fabricated low risk. New events are not passed through that aggregator or sent raw to the model. A future approved, complete source integration must establish training-day boundaries/weekday encoding and all feature definitions before enabling inference. Existing application telemetry/simulator ML and cyber pipeline remain available; no endpoint event resets those scores or invokes FREEZE. FREEZE is application account policy, not an operating-system laptop lock.

## Linux and macOS

These are real collector implementations but **not validated on those OSes**. Build on each target OS/architecture: `sh agent/packaging/build-unix.sh` includes its Node binary. Extract Linux under `/opt/cyberorbit`, macOS under `/Library/CYBERORBIT`, root-owned and not employee-writable. Provide a config with absolute `dataDirectory` and `locallyApprovedDirectories` as above. Linux uses `/etc/cyberorbit/config.json` and `/var/lib/cyberorbit`; macOS uses `/Library/CYBERORBIT/config.json` and a protected data directory. Create private root data directories, with traversal only granted to the mapped UID for its mode-0400 capability. Enroll via token on stdin using the bundled Node and the service identity. Unix helper capability is root-provisioned, readable only by the mapped UID; device/queue secrets are not in that file.

Linux credentials require `secret-tool` and a Secret Service keyring unlocked/available to the service identity. **There is no plaintext fallback.** A default headless root systemd service usually has no such keyring; provision and test a dedicated keyring/D-Bus environment before enabling the provided service. Install requires root: `sh /opt/cyberorbit/packaging/linux/install.sh`; uninstall disables/removes only service startup. For desktop startup, copy the `.desktop` file into the assigned user's `~/.config/autostart`. Requires X11, xprop, xprintidle; Wayland foreground monitoring is explicitly unavailable. loginctl requires systemd; ss requires iproute2. Other distributions report unsupported/error health rather than synthetic activity.

macOS credentials use native Security.framework Keychain APIs (Swift helper, JSON via stdin, no secrets in argv). Build/install needs Xcode command-line tools; unattended system Keychain availability and signing/access control must be verified under the launchd identity. Install daemon as root with `sh /Library/CYBERORBIT/packaging/macos/install.sh`. For desktop startup, make `packaging/macos/desktop-monitor.command` executable and install `com.cyberorbit.desktop.plist` into the assigned user's `~/Library/LaunchAgents`, then `launchctl bootstrap gui/UID PATH_TO_PLIST`; it opens a visible terminal. Remove that LaunchAgent on uninstall as well as running the daemon uninstall script. Login/logout/lock collection is not implemented on macOS. Native desktop/Keychain compilation, privacy prompts, file notifications, permissions, system_profiler/lsof behavior and launchd startup require macOS testing.

## Verification

### Windows automatic startup and administrator controls

The Windows installer uses the LocalSystem `CyberOrbitAgent` service with Automatic
boot startup and crash recovery (10, 30, then 60 seconds). Closing an unrelated
PowerShell window does not stop this service. The desktop task runs as the mapped
employee on logon; the SYSTEM `CYBERORBIT Desktop Recovery` task checks every minute
and starts it again if it is Ready and the service is Running. Both tasks have
SYSTEM/Administrators-only control ACLs. Ordinary users can query the service but
cannot stop, reconfigure or disable it. The employee must use a standard Windows
account; a local administrator can intentionally disable monitoring.

For an existing installation, run from an elevated PowerShell at the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\agent\packaging\windows\configure-startup.ps1
```

This configures startup without reenrolling, changing credentials or touching the
queue. New installs and `update-installed.ps1` also apply it. A powered-off/sleeping
laptop cannot collect activity. The service resumes at boot and foreground collection
requires the assigned employee's interactive session. A standard user can terminate
their own helper process; recovery reduces that interruption, not eliminates it.
Offline events use the existing encrypted queue.

To intentionally disable monitoring, an administrator can run:

```powershell
Disable-ScheduledTask -TaskName 'CYBERORBIT Desktop Recovery'
Disable-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor'
Stop-ScheduledTask -TaskName 'CYBERORBIT Desktop Monitor'
Stop-Service CyberOrbitAgent
Set-Service CyberOrbitAgent -StartupType Disabled
```

The watchdog never starts a stopped service or a disabled helper task. Before
reenabling, restore the service to Automatic and enable the desktop task, then run
`configure-startup.ps1` and `Start-Service CyberOrbitAgent`. Uninstall removes recovery
as well as the desktop task. Verify on the target laptop: close the launching shell,
check heartbeat progress for several minutes, terminate only the test employee's
helper and confirm recovery, then test reboot/sign-in. Also confirm a standard user
cannot stop the service or disable either task. These live checks require the
administrator to apply the configuration; mocked tests alone do not establish them.

```powershell
node --test agent/test/*.test.js
node --test server/services/test-ml-feature-aggregator.js
node node_modules/vite/bin/vite.js build --config client/vite.config.js
powershell -NoProfile -File agent/packaging/windows/build.ps1
```

The integration suite requires the configured PostgreSQL identity to CREATE/DROP a schema. It creates a random isolated `orbit_agent_test_*` schema, applies migrations there, creates test users, runs the authenticated endpoint/SSE routers, observes the actual Windows test process and its SID, verifies enrollment expiry/reuse, offline retry/queue restart, durable insertion/dedupe, correct employee dashboard data, cross-company/other-employee denial and revoked credential denial, then removes only its test schema. It does not enroll the developer laptop in the production database. See `VERIFICATION.md` for executed results and acceptance limits.

Production release still requires reviewed/pinned runtime, Authenticode signing of host/PowerShell/package, code-signing/notarization on macOS, signed Linux distribution packaging, staged installation/upgrade testing, enterprise credential lifecycle/rotation, tenant provisioning and server retention controls. The included unsigned development ZIP is not a production-ready signed installer.
