# macOS employee agent build and acceptance

Status is deliberately split: source and automated fixtures can be inspected on
Windows; launchd, Keychain, AppKit, actual OS permissions, and an employee release
must be verified on a supported Mac. This document is a test record template, not
evidence that native acceptance has already passed.

## Deployment modes and authorization

The employee package installs `com.cyberorbit.user-agent` in the logged-in
employee's `gui/<uid>` LaunchAgent domain. It does not install a root LaunchDaemon.
The account owner can control their own LaunchAgent and user-owned files using
macOS tools. Main Admin approval gates the supported employee uninstall path; it
does not make a user-owned LaunchAgent resistant to its owner or a local Mac
administrator.

The separate optional root LaunchDaemon under `/Library/CYBERORBIT` is a system
administrator/MDM deployment. Its installation, stop, update, and removal require
local root/administrator or managed deployment authority. It is not covered by
the employee uninstall grant and must not be installed from the employee ZIP.
CYBERORBIT never asks for, stores, transmits, or validates a Mac administrator
password.

`AGENT_UNINSTALL` uses the existing backend operation request, fresh Main Admin
MFA review, signed 120-second device/UID/action-bound grant, local nonce replay
history, agent acknowledgment, launchd shutdown and lock-release confirmation,
then backend completion/revocation. Local Keychain credential and app files are
removed only after the backend confirms revocation. The encrypted queue,
enrollment marker, config, and logs remain. If cleanup fails after revocation,
the employee kit's uninstall entry resumes from the local confirmed-revocation
marker. Darwin `SERVICE_STOP` is explicitly unsupported. Remote
`STOP_AGENT`/`START_AGENT` controls pause and resume collection without stopping
the service or revoking credentials; Darwin requests require Main Admin and
fresh MFA. The Mac account owner can still use `launchctl`
directly against their user agent.

## Permissions and collection scope

| Capability | Employee mode | Permission / evidence |
|---|---|---|
| Process start/stop | Processes visible to the logged-in UID | No admin credential; OS visibility restrictions can omit protected processes. |
| Foreground app and idle | Native AppKit/desktop helper for the logged-in GUI user | GUI login required. Accessibility is needed only for approved browser-title support; title collection also requires local and dashboard approval. |
| Lock/session | Native session observation where macOS exposes it | Unavailable lock state remains unknown/degraded; no inferred unlock. Login/logout final delivery is best effort. |
| USB inventory | `system_profiler SPUSBDataType` inventory and observed snapshot differences | Standard-user availability must be checked on target macOS. Detection is not blocking or evidence of file transfer. |
| Network | Established TCP sockets scoped to the employee via `lsof -u <account>` | Scope is the account and visible sockets, not device-wide traffic or a connectivity/interface-change feed. |
| Approved file changes | User-owned approved directories | Employee and dashboard approval; names/path changes only, no file contents or reads. |
| Browser titles | Supported Chromium/Firefox companion proof | Accessibility approval, companion installation, local setting, dashboard setting, normal focused window; private windows excluded. Safari titles unsupported. |
| Account control / device-wide policy | Unsupported in employee mode | Separate managed privileged architecture would require administrator/MDM design. USB observation does not enforce USB policy. |

No Full Disk Access or system extension is silently requested. If a target
macOS release requires an additional permission, capture the actual OS prompt,
grant only through System Settings/MDM, and report unavailable until verified.

## Build an employee package on a Mac

The supplied build handoff is self-contained after extraction; the Mac build
does not use the Windows repository. Use a logged-in Mac build account with
Apple Command Line Tools. From the extracted `CYBERORBIT-macOS-Build-Kit`
directory, run:

```sh
./Build-Mac-Install-Kit.command
```

The command detects macOS and CPU, checks Xcode Command Line Tools and required
system tools, validates both pinned runtime hashes, compiles employee helpers
for arm64 and x86_64, validates each Mach-O architecture, runs Mac-specific
tests on the build host, and creates the employee ZIP, manifest and checksum. The build
host runs native tests only for its own architecture. Before distribution, run
the acceptance sequence below on Apple Silicon and Intel, verify the manifest
and ZIP checksum independently, and sign/notarize with the organization's
Developer ID and normal Gatekeeper process. Do not disable Gatekeeper, TCC, SIP,
or FileVault. Signing/notarization credentials must not be added to the package.
For repeatable package metadata and ZIP timestamps, set a fixed
`SOURCE_DATE_EPOCH` before running the build command in Terminal, for example
`export SOURCE_DATE_EPOCH=1760000000`; keep the same source revision, pinned
runtime archives and Xcode/Swift toolchain. The build automatically runs the
archive-level release test against the generated employee ZIP before reporting
success. Code signing may make bytes depend on signing identity/time and must be
recorded separately.

Expected output from the extracted handoff directory:
`output/CYBERORBIT-macOS-Employee.zip` and
`output/CYBERORBIT-macOS-Employee.zip.sha256`.
For a clean-machine pre-install check, extract the employee ZIP and run
`./Validate-CYBERORBIT-Package.command` from `CYBERORBIT-macOS-Employee`. This
checks contents, hashes, architecture payloads, OS/runtime version and the
logged-in GUI launchd prerequisite without installing or changing anything.

Employee install: extract the validated employee ZIP and double-click
`Install-CYBERORBIT.command` as the employee (no `sudo`), then enroll with the
one-time assigned token in Terminal when prompted. Existing enrolled installs
use `Update-CYBERORBIT.command`; it preserves Keychain identity, queue and config.
Uninstall: double-click `Uninstall-CYBERORBIT.command`, request
`AGENT_UNINSTALL`, and wait for Main Admin approval with fresh MFA. Keep the
extracted employee kit until uninstall has completed or recovery is no longer
needed. Do not manually delete `~/Library/Application Support/CYBERORBIT`.

## Native acceptance procedure

Run on disposable enrolled devices and retain dated command output/screenshots.
For each row record macOS version, CPU, account UID, agent/package version,
request/event IDs, timestamp, PASS/FAIL/BLOCKED and evidence path. Local agent
logs are `~/Library/Application Support/CYBERORBIT/logs/launchd.log`; local
status is available with the extracted kit's `Check-CYBERORBIT.command` and
`Diagnose-Application-Usage.command`. Use Devices, endpoint activity, Main Admin
operation review and Audit Logs in the deployed console for server evidence.

| # | Test and exact action | Expected result / evidence / pass criterion |
|---:|---|---|
| 1 | Verify ZIP: `shasum -a 256 CYBERORBIT-macOS-Employee.zip`; compare with trusted release checksum. Extract, then run `./Validate-CYBERORBIT-Package.command` from the extracted package. | Hash matches out-of-band checksum; validator reports macOS version and CPU; manifest says `employee-install`, both architectures and source version; every listed file matches; GUI launchd prerequisites are present; no Windows files, root daemon plist, credentials, tokens, `.env`, or test fixtures. Any mismatch fails. |
| 2 | Fresh install: as standard employee, double-click `Install-CYBERORBIT.command`; inspect terminal output. | Version/CPU accepted, per-user files created with private ownership, `plutil -lint ~/Library/LaunchAgents/com.cyberorbit.user-agent.plist` succeeds, enrollment uses assigned token once, authenticated heartbeat appears. No root prompt/service. |
| 3 | Run `./Show-Employee-Identity.command`, compare its UID/host with the assigned device, then double-click `Install-CYBERORBIT.command` and complete the hidden enrollment prompt. | Server device is assigned employee + matching `uid:<n>`, platform darwin; token is not echoed/logged; no duplicate enrollment. |
| 4 | Startup/login: `launchctl print gui/$(id -u)/com.cyberorbit.user-agent`; log out/in. | One LaunchAgent instance, RunAtLoad/KeepAlive, fresh heartbeat after login; no duplicate job or login item. |
| 5 | Reboot recovery: reboot the disposable Mac, log in, run the same `launchctl print` and `Check-CYBERORBIT.command`. | One agent resumes and sends a fresh heartbeat; queue/identity unchanged. |
| 6 | Sleep/wake: record time, sleep several minutes, wake and inspect endpoint events/log. | Collection resumes; no fabricated duration or lock/unlock. A state macOS cannot expose is reported unknown/degraded. |
| 7 | Application monitoring: open/switch TextEdit and a browser; run `Diagnose-Application-Usage.command`; inspect dashboard timeline. | Foreground records identify observed app/UID; no title without all approvals; dashboard event IDs correspond to actual observations. |
| 8 | Duration: actively use one app >35 seconds, then switch away. | One usage interval with observed duration, bounded by samples; no idle/locked time added. |
| 9 | Idle: leave device untouched beyond configured 60-second threshold; inspect desktop status and usage. | Usage is excluded while idle; no synthetic active event. |
| 10 | Lock/unlock: lock with `Control-Command-Q`, unlock normally, inspect timeline and `launchd.log`. | Emit only confirmed lock/unlock; unknown OS state remains unknown. |
| 11 | Network scope: enable configured network collection and inspect `NETWORK_CONNECTION` records while the employee has an established TCP connection. | Only observed established TCP sockets visible to that account; this is not an interface/connectivity event or device-wide network capture. |
| 12 | USB: record baseline, connect/disconnect a harmless test USB device, inspect `USB_CONNECTED`/`USB_REMOVED`. | Initial inventory is baseline; subsequent observed changes appear with hardware/name metadata where OS supplies them. No “blocked” claim or file-transfer inference. |
| 13 | Heartbeat: `launchctl print gui/$(id -u)/com.cyberorbit.user-agent`; compare Devices last heartbeat and health. | Server timestamp advances from authenticated heartbeat; collector health matches local diagnostics. |
| 14 | Offline queue: disconnect network, generate ordinary test activity, inspect queue count in diagnostic; reconnect. | Encrypted queue grows offline, survives service restart, drains after reconnection; stable event IDs appear once. Never inspect or publish private content. |
| 15 | Main Admin approval: double-click uninstall, provide reason; approve that device/action in Main Admin operation requests using fresh MFA. | Status proceeds request → approved/grant accepted/executing → completed; device, UID and `AGENT_UNINSTALL` bind. Audit records request, review, result. |
| 16 | Rejection: on a separate test request, reject from Main Admin with fresh MFA. | Agent remains registered/running; files, Keychain, queue, enrollment marker unchanged; backend records rejected. |
| 17 | Expiry: request approval and leave grant unconsumed beyond its 120-second expiry; attempt supported execution. | Expired grant rejected locally/server-side; no stop/revoke/file removal; request expires in audit/status. |
| 18 | Replay: after a grant is accepted/consumed, replay the same request/grant from the test harness or repeat the action. | Nonce history/server state rejects replay; no second execution. Preserve command output without exposing grant signature/token. |
| 19 | Monitoring stop/resume: as Main Admin with fresh MFA, use the console device monitoring controls; separately issue stop then resume and compare heartbeat health. | Darwin command is device/UID-bound and expires; service persists pause, suppresses collection/upload while retaining authenticated heartbeat, acknowledges `PAUSED_BY_ADMIN`, then resumes collectors and acknowledges `ACTIVE`. No service stop or credential revocation. Audit both actions. |
| 20 | SERVICE_STOP: request through the supported client if exposed; do not use direct launchctl as evidence of authorization. | Current Darwin local operation path explicitly rejects SERVICE_STOP. Expected safe result is unsupported with no change. Employee can still directly control own LaunchAgent; document this trust boundary. |
| 21 | Authorized uninstall ordering: approve a fresh request; capture local/server timestamps and request ID. | launchctl bootout and service lock release precede completion/revocation; credential is revoked only after successful shutdown. No credential/file removal on earlier failure. |
| 22 | Credential revocation: after successful uninstall, attempt authenticated heartbeat using disposable credential through test tooling; inspect server device. | Server rejects credential; device shows revoked; Keychain entry removed only after confirmed revocation. Do not print credential. |
| 23 | Partial cleanup: on disposable clone, induce a post-revocation plist/app cleanup failure without changing queue data, then rerun kit uninstall. | Exact failed/completed step reported; revoked marker retained; kit resumes idempotently without another grant or server credential; queue, marker, config/logs retained. |
| 24 | Reinstall: after revocation, run employee installer with a newly assigned device/token. | Old revoked enrollment is not silently reused; new assignment succeeds without deleting retained old queue/evidence. |
| 25 | Upgrade: install a versioned test package over existing install via `Update-CYBERORBIT.command`. | Enrollment identity, Keychain helper, queue and config preserved; staged app starts and fresh heartbeat is acknowledged. |
| 26 | Rollback: on a disposable clone, stage a package that fails fresh heartbeat or make launchd restart fail; inspect app directories/launchd. | Updater attempts to boot out the failed build, restore `app.previous-*`, retain the failed tree as `app.failed-*`, and restart the prior app. It reports rollback failure distinctly if launchd cannot restart. No data/token reset; physical rollback acceptance required. |
| 27 | Dashboard/audit: review Devices, endpoint timeline, operation requests, Audit Logs and employee attribution for all test IDs. | Online state derives from recent authenticated heartbeat; event type/employee/device/timestamps match captured observations; approval/rejection/completion are auditable. |

## Current support matrix

| Area | Status from code/tests | Native/admin gate |
|---|---|---|
| Employee LaunchAgent, enrollment, Keychain, encrypted queue, update/rollback | Implemented; package rollback helper and state preservation automated tests cover portions | Physical install, login/reboot, Keychain, launchd failure injection and rollback acceptance required. |
| Authorized `AGENT_UNINSTALL` | Implemented; signed grant, action/device/UID/expiry/replay and sequencing tests | Physical launchd shutdown, Keychain revoke, failure recovery and backend deployment required. |
| `SERVICE_STOP` on Darwin | Unsupported by current employee grant policy | Requires explicit product/backend and recovery design; Main Admin approval alone cannot constrain the UID owner. |
| Remote monitoring pause/resume | Implemented using the existing expiring STOP_AGENT/START_AGENT heartbeat contract; Darwin route requires Main Admin and fresh MFA | Automated backend/agent command tests plus physical launchd/telemetry acceptance required; same-account owner can alter user-owned pause state. |
| USB/network employee observations | Limited user-scope inventory/socket observations implemented; tests cover parsers and command scoping | Verify `system_profiler` and `lsof` behavior/privacy on supported Macs; not enforcement or full connectivity telemetry. |
| Accessibility/browser titles | Implemented with dual consent and freshness checks | Physical browser/TCC acceptance; Safari titles unsupported. |
| Root LaunchDaemon | Separate administrator/MDM deployment | Requires local admin/MDM architecture and acceptance; excluded from employee package. |

## Test evidence and known limits

Platform-independent and mocked tests do not prove native behavior. On Windows,
`npm run test:macos` can exercise authorization, package validation, parsers and
state handling; native process, Keychain, flock, AppKit/launchd tests skip. The
employee release build itself must run on macOS with Xcode Command Line Tools.
Apple Silicon and Intel payloads are cross-compiled, but runtime acceptance is
required on each architecture. Network observations are established TCP sockets
for the employee account, not network-interface changes. USB observation is not
policy enforcement. Same-account users/local administrators can bypass user-mode
controls. The current backend does not support centrally authorized Darwin
SERVICE_STOP. Remote monitoring pause/resume is implemented through the existing
Main Admin fresh-MFA endpoint controls but still requires physical Mac execution
and telemetry acceptance.

## Windows-host implementation verification — 2026-11-03

The implementation and build scripts were exercised from Windows. `npm run
test:macos` completed with 50 passed, 0 failed, 6 skipped. The Mac release
script consistency test passed separately. The full agent suite
completed with 130 passed, 0 failed, 8 skipped. The complete backend suite
completed with 127 passed, 0 failed, 2 skipped on its second run. The first
backend run had one browser device-token timeout; the same test passed alone and
on the complete rerun. The macOS archive release test passed against the cleanly
extracted build-only handoff; its Windows-archive test was skipped because no new
Windows archive was supplied. `npm run build` completed successfully (Vite warned that
the main JavaScript chunk exceeds 500 kB).

The Windows-generated handoff is
`%TEMP%/CYBERORBIT-macOS-Build-Kit-Final-Testing-v7.zip`. Its manifest marks it
`employeeInstallable:false`; its archive test verifies manifest hashes, clean-
extract command/source closure, and platform exclusions. It is a Mac build
handoff, not an employee installer. Record the handoff archive's SHA-256
alongside it when transferring; the employee ZIP must be built and tested on
macOS with the documented command before use.
