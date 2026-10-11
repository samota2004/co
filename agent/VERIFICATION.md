# Verification performed — 7 October 2026

Environment: Windows, Node v24.20.0, configured local PostgreSQL database `cyberorbit`. No production device credentials/tokens were written into source. Existing unrelated working-tree edits were preserved.

Passed:

- Prisma client generation and schema validation.
- Additive migration deployment to the configured local database: no-op repair plus endpoint schema. Existing employee/risk records preserved.
- Contract/config tests: reject identity injection, private contents, unsupported types, bad timestamps and unsafe HTTP URLs.
- Encryption/offline tests: restart recovery, bounded overflow with persisted drop count, partial acknowledgment, failed upload retention/retry and revoked credential handling.
- Security tests: administrator-only assignment, company scope, enrollment expiry/reuse, verified SID attribution, unmapped-session separation, device mismatch, deduplication and revocation.
- Real Windows observations: native process enumeration/process-token SID, WTS sessions, CIM USB inventory, TCP snapshots, DPAPI encryption roundtrip, actual desktop foreground/idle/WTS lock state. Test uses real OS data, not collector simulations.
- Actual approved filesystem notifications: nested file changes emit names/types without reading contents.
- Local IPC: valid capability succeeds; wrong key/identity fails; both request and response signatures checked.
- Real end-to-end integration: temporary isolated PostgreSQL schema, MFA JWT administrator assignment, token exchange, actual Windows test process, failed network upload, queue restart, successful authenticated upload, committed storage, employee dashboard response, other-employee/company denial, duplicate suppression and revoked credential rejection.
- SSE integration: anonymous stream rejected; authenticated ticket accepted; other-company and other-employee notifications filtered.
- Existing 21-feature ML aggregator regression check.
- React production build (2,293 modules); pre-existing large-chunk warning remains.
- Express server bundle build.
- JavaScript syntax and native PowerShell parser checks.
- Runtime-inclusive Windows ZIP and .NET service host compiled. Included runtime: Node v24.20.0. SHA256 manifest provided under `agent/dist`.

The end-to-end test exercises the dashboard's authenticated data route and stream used by React; it does not claim a manual browser visual review or full installed-service trial. Integration tests remove only their randomly named test schemas and local queue directories.

Not executed / acceptance required:

- Elevated installation/uninstall against SCM, LocalSystem reboot startup, scheduled-task startup/fast user switching/RDP, service crash recovery, second-user ACL tests and physical USB insertion/removal. API state queries passed; physical transition scenarios were not forced on the developer's laptop.
- Intermittent HTTPS proxy/enterprise-CA deployment, abrupt power loss, disk-full behavior, 50MiB stress and prolonged offline operation. Offline retries/restart/overflow tested at smaller deterministic limits.
- Linux `/proc`/loginctl/sysfs/ss/X11/keyring/systemd and macOS ps/USB/lsof/Swift/Keychain/launchd collectors/startup. Wayland foreground and macOS login/logout/lock are explicitly unsupported.
- Production Authenticode signing, macOS notarization, signed Linux packaging, upgrade/credential rotation, enterprise tenant provisioning, legacy project-wide tenant isolation and backend history-retention jobs.
- Endpoint ML inference is intentionally unavailable because the complete training feature/preprocessing semantics and approved email/HTTP/file-read sources are not available. No missing features are fabricated and application FREEZE does not lock the OS.

See README.md for exact setup/build/install/run/revocation/uninstall commands and collector sampling limits.

## Enrollment follow-up, agent 1.0.1

18 regression tests passed, none skipped: shared enrollment schema, bounded/redacted error propagation, malformed JSON and payload limits, expiry, used/revoked tokens, inactive employee, concurrent single-use exchange, Windows SecureString/BSTR/PowerShell stdin into the real CLI, actual DPAPI credential storage, local reenrollment refusal, existing Windows collectors, offline recovery, company isolation, Devices browser, shared HTTP/HMR startup and ML feature aggregation. An additional local-state guard test verifies invalid input does not create state/contact the backend and orphaned credential writes cannot be overwritten. Database tests used isolated schemas and preserved real assignments.

Windows installer/build/reset scripts parsed successfully. Full elevated service installation and reset against the existing protected `Program Files`/`ProgramData` directories cannot be executed from this process: Windows ACLs deny access. Their contents/credentials were not read and no ACL was weakened. The installer token pipeline and protected storage were executed with temporary test state; actual SCM/task/reboot acceptance remains required. No claim is made that the old log reveals the precise rejected value; the old code discarded that information.

Rebuilt unsigned Windows package with agent 1.0.1 and Node v24.20.0. Packaged enrollment files matched source; the enrollment suite also passed using the packaged CLI. Backend reloaded on localhost:3000; controlled invalid requests through both ports 3000 and 5173 returned `ENROLLMENT_TOKEN_FORMAT`, a useful message and the same request ID recorded in sanitized server logs. The server bundle passed and 32 JavaScript files / 7 PowerShell scripts passed syntax/parser checks. Existing protected installation/data and real database assignments were not changed.

## Extracted kit / clipboard follow-up, agent 1.0.2

The user's actual `agent/dist/install-kit` manifest was verified as 1.0.0, despite the prior rebuilt `dist/windows` manifest being 1.0.1. Its old installer/uploader explained the repeated uninformative `Endpoint HTTP 400`. The provided backend screenshot now establishes `ENROLLMENT_TOKEN_FORMAT`, field `token`, reason `invalid_format`; it is a schema failure before the token database lookup. A hidden prompt's asterisks do not establish the actual entered length.

Five enrollment tests passed, including the new actual PowerShell input helper with controlled clipboard/host text (the user's real clipboard was neither read nor changed), valid/invalid/empty inputs, sanitized length-only failures, real backend exchange, single-use races and DPAPI. The builder checks for state/reparse points before refreshing extracted package files. Clipboard enrollment waits until after command entry, allowing the user to Copy token without subsequent command-copy replacing it. No backend process is started/restarted/stopped for this follow-up; protected install/data and `.backup-*` folders remain untouched. Elevated SCM installation and the final user's GUI clipboard/paste flow still require execution in the user's terminal.

## Installed LocalSystem service repair, agent 1.0.3

Actual installed service: CyberOrbitAgent, LocalSystem, automatic startup, originally stopped with exit 1067. The enrolled device had lastSeen=null and agentVersion 1.0.2. The administrator-authorized protected updater and a temporary LocalSystem task were executed on this machine. The final sanitized report is `agent/local/service-repair-result-2.json` (ignored, no credentials).

Confirmed cause: LocalSystem effective execution policy was Restricted, with persisted policy scopes Undefined. Original `vault.ps1` invocation exited 1 with EXECUTION_POLICY. Configuration/credential files were readable. Explicit child-process policy allowed the same LocalMachine DPAPI credential to decrypt (exit 0), and `windows-snapshot.ps1` also passed (exit 0). No persistent execution-policy scope, DPAPI scope, runtime, service executable, enrollment or credential was changed. The first updater probe was blocked by its default battery settings and safely rolled back; the probe now explicitly permits battery operation, and the second update completed successfully.

Data ciphertext hashes, existing file/root ACLs and configuration were verified unchanged before service restart. Six code files were updated in place with code backups and rollback support. The final report records success=true, dataAndAclsPreserved=true, serviceStatus=Running after a 40-second stability interval. The temporary task was removed. Backend verification found fresh authenticated heartbeats from the existing device at 2026-10-07 17:39:14 UTC and agentVersion 1.0.3, unchanged enrolledAt 16:56:23 UTC and revokedAt=null. Real process/session/USB events and authenticated desktop activity were durably stored; health reported healthy collectors and zero dropped events. Probe code never submits a heartbeat, so these are from the running service.

17 agent/enrollment tests passed without skips, including restricted-policy reproduction, unchanged persisted policy, LocalMachine DPAPI, native diagnostics redaction, service-lock cleanup, Windows collectors/desktop, queue/offline/recovery, company boundaries and real enrollment. Syntax checks passed for 35 JavaScript files and 9 PowerShell scripts. Reboot/SCM automatic-start acceptance and enterprise Group Policy/signing deployment remain separate production checks. The user's VS Code backend was not restarted or duplicated.

## Application usage visibility follow-up

Actual cause confirmed in the developer's enrolled device data: APPLICATION_USAGE for both Notepad and brave had already reached PostgreSQL with the mapped SID and assigned employee. The mixed 150-event dashboard query hid the older Brave event (2026-10-07 17:52:24.906 UTC) behind 1,070 newer employee events, including 1,030 PROCESS events. The administrator mixed query had 2,158 newer events, including 2,079 PROCESS events. The new usage filter returned that exact stored event while the mixed query did not. There is no application-name allowlist or evidence of an application-specific collector/permission failure. The initial diagnostic sampled Code with input idle 119,594ms, so it was correctly excluded from further usage accumulation; no input was synthesized to defeat idle detection.

Trace inspected: `windows-desktop.ps1` uses GetForegroundWindow/GetWindowThreadProcessId and Get-Process.ProcessName in the logged-in session; `desktop-helper.js` sends the real samples through timestamp/nonce/HMAC-protected IPC; the service binds samples to the mapped SID and session, aggregates active intervals and flushes on switch/~30s; normalization validates APPLICATION_USAGE; the encrypted persistent queue retains events until durable ingestion acknowledgment; ingestion derives company/device/user from the credential and verified SID; the dashboard filters in PostgreSQL before limiting; React renders the same event IDs. Process enumeration is never promoted to foreground use. Current heartbeat reported a healthy authenticated desktop helper, active configuration and zero dropped events.

The user's interactive reproduction produced Notepad pid 27392, 28.45s at 18:05:00.561 UTC, eventId `2e218d75-b437-4033-9e82-8893daa119a2`, and brave pid 12052, 10.15s at 18:05:10.710 UTC, eventId `1391b445-49b5-48e4-8669-fcf13a507cb0`. A separate observation-only helper timed out after the user had returned to Code; it emitted no events and is not used as reproduction evidence. The installed helper/service generated the recorded usage without agent modifications.

Actual Chrome browser verification used a temporary loopback listener with the existing database and real authenticated backend routes, forbidding persistent mutations. Both the admin Devices page and assigned employee dashboard rendered those exact two stored APPLICATION_USAGE event IDs, names, durations and verified identity; dashboard HTTP 200 included the application filter, with zero JavaScript exceptions or console errors. This listener was closed and its browser profiles removed. Sanitized results are ignored at `agent/local/usage-browser-result.json`. No rows were fabricated or copied into the live database.

Six automated tests passed without skips across the usage-filter, existing device API/browser and enrollment/agent integration suites. Regression fixtures used random isolated schemas and explicitly simulate process noise only for testing; they are separate from the real installed-device evidence above. Frontend production build, backend bundle, 35 JavaScript syntax checks and nine PowerShell parser checks passed. The pre-existing frontend chunk-size warning remains.

The existing localhost:3000 backend initially returned HTTP 200 without filter metadata because its old route was still loaded. A restart of that same VS Code backend is required to enable the changed server query on the user's normal URL. The user's backend was not stopped or replaced, and installed enrollment, encrypted credentials/queue, ACLs and service were untouched; CyberOrbitAgent remained Running throughout.

## Application picker and actual localhost verification

Follow-up screenshot showed the correct usage view with newer Code/Chrome observations at the top, but application names were buried in JSON. The running localhost:3000 route was now confirmed to apply the filter and return eleven Notepad/Brave observations. The remaining problem was finding/rendering those rows rather than collector failure. The panel now displays friendly names and foreground seconds, provides an Application picker and clickable usage summaries scoped to the loaded events, and collapses raw JSON. Selecting an app resets the timeline scroll; All applications and All activity remain available. Unattributed observations do not display the assigned employee as the actor.

Actual headless Chrome verification ran against the user's normal `http://localhost:5173/devices` and `/employee-dashboard` pages and existing backend/database (no replacement server). It verified real Notepad 20.32s, eventId `1ec568ef-7083-4e12-84c1-86b0382e9237`, and Brave 10.15s, eventId `1391b445-49b5-48e4-8669-fcf13a507cb0`, with verified employee identity. Clicking each real application's summary displayed only that application's headings and collapsed technical details. Dashboard requests returned HTTP 200 with the application filter, with zero console errors and JavaScript exceptions in both roles. Browser profiles were temporary and removed; the main backend and installed service were not restarted, enrollment/credentials/queue/ACLs were untouched. Sanitized result and dashboard-only screenshots are ignored under `agent/local/`. No OS screenshot collector or synthetic input/events were added.

The updated `npm run test:usage` suite passed both tests without skips, including app headings/duration, dropdown/card selection, restoring all applications, existing device actions, pre-limit filtering and authorization. Frontend production build passed (the existing chunk-size warning remains). CyberOrbitAgent was confirmed Running with Automatic startup after verification.
