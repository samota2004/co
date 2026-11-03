# CYBERORBIT Windows and macOS Agent Parity Audit

**Audit date:** 2026-11-03
**Scope:** Repository source, tests, documentation and release artifacts inspected on 2026-11-03. The original comparison below records the audit snapshot; implementation updates are appended and supersede outdated status rows where noted.

## Executive summary

The platforms share one Node.js agent core and event/API contract, but do not offer equivalent deployment or privileged-management behavior. Windows is installed as a machine-wide LocalSystem service with a per-user desktop helper and supports protected service control plus a Main Admin fresh-MFA path for `SERVICE_STOP` and `AGENT_UNINSTALL`. The macOS employee LaunchAgent has Main Admin grant-gated `AGENT_UNINSTALL` with server-confirmed revocation, queue/evidence retention and partial-cleanup recovery. Darwin remote `STOP_AGENT`/`START_AGENT` monitoring controls now use the existing authenticated heartbeat contract and require Main Admin fresh MFA. Darwin `SERVICE_STOP` remains unsupported. Employee USB observation and established-TCP observation are limited to available macOS inventory and the logged-in account; they are not enforcement or device-wide network telemetry. A separate root LaunchDaemon remains an administrator/MDM deployment and is not included in employee packages.

The current `agent/dist/CYBERORBIT-macOS.zip` is not an employee-installable macOS agent. Its embedded `build-kit-manifest.json` says `kind: macos-build` and `employeeInstallable: false`; it contains source and pinned runtime archives intended for a Mac builder. The official Mac release builder creates `CYBERORBIT-macOS-Employee.zip` after compiling native helpers and running Mac tests; it refuses to overwrite an existing employee release. The current Windows ZIP is a version 1.1.0 employee/runtime package with a 69-entry inventory manifest.

### Parity estimate

**Estimated source-level capability overlap: 48% (12 of 25 families).** The denominator is this fixed checklist: enrollment; credential persistence; background execution; event contract; employee/device attribution; heartbeat/health; encrypted offline queue; retry and acknowledgment; duplicate prevention; dashboard visibility; process events; foreground/usage; session events; idle/lock; file activity; network activity; USB observation; USB enforcement; monitoring pause/resume; service stop; uninstall/revocation; employee disclosure; update/rollback; data minimization; and ordinary-user/administrator security boundary. One point means both code paths provide a usable baseline for that family, even if their OS mechanisms differ. The 12 overlapping families are enrollment, credential persistence, background execution, event contract, attribution, heartbeat, encrypted queue, retry/acknowledgment, duplicate prevention, dashboard visibility, file activity, and data minimization. A material capability absent or restricted to a different deployment mode earns zero. This is not a test pass rate; native acceptance remains separate. The denominator is an audit estimate, and the user/root macOS modes are assessed separately where relevant.

### Evidence labels used in this report

- **IMPLEMENTED** — source implements the described behavior and relevant automated evidence exists. This label does not by itself mean the real deployment was accepted on both OSes.
- **PARTIAL** — useful implementation exists but scope or behavior is materially limited.
- **MISSING** — no equivalent behavior found in the inspected implementation.
- **UNSUPPORTED** — the selected install mode or OS interface intentionally cannot provide it. This is distinct from an OS-wide limitation.
- **NOT VERIFIED** — code/package path exists, but required native or production acceptance evidence is unavailable.

For compactness, matrix cells use those exact status terms and then identify relevant mode-specific limitations. Code inspection, automated test evidence and real-device evidence are separated in Sections 3 and 4.

## 1. Architecture and lifecycle paths

### Shared core

Both platforms use `agent/src/service.js`, `agent/src/collectors/*`, `agent/src/queue.js`, `agent/src/uploader.js`, `agent/src/health.js`, `agent/src/credential-store.js`, `agent/src/enrollment.js`, `agent/src/ipc.js`, `agent/src/desktop-usage.js`, and the wire contract in `agent/shared/contract.js`. The shared event normalizer and event validator mean the OS collectors feed the same versioned API schema. Shared code does not make OS collection equivalent: collector snapshots and desktop observation come from distinct native paths.

### Windows production employee path

`agent/packaging/windows/install.ps1` installs an elevated, machine-wide service. `agent/packaging/windows/ServiceHost.cs` hosts the bundled Node worker as a Windows SCM service. A per-user scheduled desktop task and recovery/watchdog tasks bridge the interactive session. `agent/native/windows-snapshot.ps1`, `windows-api.cs`, and `windows-desktop.ps1` provide process/session/device/network and foreground/idle/lock observations. `agent/packaging/windows/windows-elevation.ps1`, `request-operation.ps1`, `uninstall.ps1`, `agent/src/local-operation-auth.js`, and `agent/src/service.js` implement the elevation-plus-Main-Admin grant workflow.

### macOS employee ZIP path

The official employee workflow is built by `agent/packaging/release/build-macos.sh` and `agent/packaging/macos/build-install-kit.js`, then installed as the logged-in employee with `agent/packaging/macos/install-user.sh` / `agent/src/macos-user-install.js`. It stores its runtime and data under the employee home directory and registers a LaunchAgent in that user's `gui/<uid>` domain. The native desktop helper is `agent/native/macos-desktop.swift`; lock/session support is in `macos-lock.swift`; Keychain operations are in `keychain.swift`.

### Separate macOS root deployment

`agent/UNIX.md`, `agent/src/configure-unix.js`, and the root LaunchDaemon/LaunchAgent templates (`agent/packaging/macos/com.cyberorbit.agent.plist`, `com.cyberorbit.desktop.plist`) describe a separate root-managed deployment. It can access wider system scope and optionally use account control after a recovery-admin preflight. The official employee user installer detects `/Library/CYBERORBIT/config.json` and refuses to overlap this mode. Do not infer that capabilities of this optional root deployment are present in the normal employee ZIP. Neither mode currently has the Windows-style Main Admin `SERVICE_STOP` / `AGENT_UNINSTALL` grant path.

## 2. Feature-by-feature comparison

### A. Installation and lifecycle

| Capability | Windows | macOS | Evidence and difference |
|---|---|---|---|
| Fresh installation | IMPLEMENTED | PARTIAL | Windows elevated installer and service registration: `packaging/windows/install.ps1`. Mac employee install is implemented as a Mac-built kit and logged-in user workflow; the current `dist` ZIP is a build kit, not an employee kit. |
| Reinstallation / existing enrollment | IMPLEMENTED | PARTIAL | Windows update/install checks preserve data roots; Mac user installer resumes existing enrollment, but separate root/user modes complicate migration and overlap is refused. See `macos-user-install.js`, `install.ps1`. |
| Background execution and startup | IMPLEMENTED | IMPLEMENTED | SCM service + scheduled desktop helper/watchdog vs per-user LaunchAgent with KeepAlive; optional root LaunchDaemon exists. Different scopes and failure/restart semantics. |
| Uninstall authorization | IMPLEMENTED | MISSING | Windows requires native elevation and fresh, device/action-bound Main Admin `AGENT_UNINSTALL` grant. Mac employee removal is a local employee command; no corresponding grant validation or server-side revoke. |
| Uninstall cleanup and data retention | IMPLEMENTED | PARTIAL | Windows removes service/tasks/install tree only after stop/revoke; preserves ProgramData unless explicit `-PurgeData`. Mac user uninstall stops its LaunchAgent and removes the user support root, credential and queue; server revocation is a separate dashboard action. |
| Upgrade / rollback | IMPLEMENTED | PARTIAL | Windows staged updater validates allowlist and has rollback. Mac update is in-place within the user app with guarded paths and preserved config/enrollment/queue; a comparable rollback and release acceptance path is not evidenced. |
| Crash/reboot recovery | IMPLEMENTED | PARTIAL | Windows SCM recovery and scheduled watchdog; Mac LaunchAgent KeepAlive and throttling. Neither source test suite proves recovery across real user logout, reboot, or OS upgrades on both hardware families. |

### B. Authentication and security

| Capability | Windows | macOS | Evidence and difference |
|---|---|---|---|
| Device enrollment / assigned identity | IMPLEMENTED | IMPLEMENTED | Shared server one-use enrollment exchange; Windows maps verified SID, Mac employee mode maps `uid:<n>`. Server contract: `server/services/endpoint-service.js`, `shared/contract.js`. |
| Credential storage | IMPLEMENTED | IMPLEMENTED | Windows machine DPAPI helper; macOS compiled Keychain helper. User/root storage scope differs. Native Mac Keychain test did not run on this host. |
| Local IPC identity and permissions | IMPLEMENTED | PARTIAL | Windows helper channel uses authenticated identity/key and protected scheduled-task boundary. Mac has owner-only local IPC/lock and helper capability files, but user-mode same-account control is not a privileged security boundary against that user. Native Mac verification pending. |
| Service/daemon permissions | IMPLEMENTED | PARTIAL | Windows installer applies service DACL giving SYSTEM/admin full control and built-in Users query-only rights; file/task ACLs are protected. Mac user LaunchAgent runs as its employee; root LaunchDaemon configuration is root-managed, but no equivalent installed launchd authorization/DACL acceptance evidence was available. |
| Native administrator elevation for stop/uninstall | IMPLEMENTED | MISSING | Windows uses `Start-Process -Verb RunAs` via `windows-elevation.ps1`; no Windows administrator password is handled by CYBERORBIT. Mac user uninstall asks the current employee to run locally without sudo. Root mode is operated by local root/admin, not native elevation paired with Main Admin approval. |
| Main Admin fresh-MFA approval for `SERVICE_STOP` | IMPLEMENTED | MISSING | Backend local operation routes accept these actions only for Windows service devices; grant issuance follows fresh MFA and is device/action bound. Mac service does not request or consume this grant. |
| Main Admin fresh-MFA approval for `AGENT_UNINSTALL` | IMPLEMENTED | MISSING | Windows backend + local executor flow. Mac uninstall does not use it and reports dashboard revocation separately. |
| `MONITORING_STOP` / `MONITORING_RESUME` | IMPLEMENTED | PARTIAL | Shared pause configuration and monitoring lifecycle exist. Windows management stop/start commands and persistent stop state are Windows-specific. Mac employee user flow supports monitoring controls but is not proven to match every Windows administrative-stop transition. Keep these distinct from service stop/uninstall. |
| Expiry / nonce replay / device and action binding | IMPLEMENTED | MISSING | Windows signed local grants are short-lived, single-use, persisted against replay, and checked against device/action. No Mac equivalent local operation grant handler for privileged stop/uninstall. |
| Server credential revocation | IMPLEMENTED | PARTIAL | Windows uninstaller revokes only after confirmed service stop, then removes files. Mac revocation can be performed in dashboard, but its local uninstaller does not revoke or wait for server confirmation. |
| Tamper resistance | PARTIAL | PARTIAL | Windows standard-user boundaries are enforced via SCM DACL and protected paths; unrestricted local admin/SYSTEM can tamper. Mac user mode is owned by the employee account; root mode is protected from ordinary users by OS ownership but unrestricted root can tamper. Neither provides hardware-backed anti-tamper attestation. |

### C. Endpoint monitoring

| Capability | Windows | macOS | Evidence and difference |
|---|---|---|---|
| Process inventory and start/stop | IMPLEMENTED | PARTIAL | Windows native CIM/WTS snapshots include process owner/session and IDs; Mac user mode filters process observations to its own UID and uses polling/snapshots. Brief process transitions may be missed by polling. |
| Active application and usage duration | IMPLEMENTED | PARTIAL | Windows foreground helper samples user32 foreground/idle state; Mac AppKit/NSWorkspace helper samples own active app. Mac needs real AppKit/Swift execution and user session; native test skipped here. |
| Window title / browser title | PARTIAL | PARTIAL | Both gate title use through local/dashboard consent and browser companion. Windows reads foreground title through helper; Mac uses Accessibility AX and registered native host. Safari title collection is unsupported; real Accessibility/browser tests pending. |
| Idle and lock/unlock | IMPLEMENTED | PARTIAL | Windows `GetLastInputInfo` and WTS lock/session state. Mac uses CG event idle and lock helper, and reports unknown where OS state is not available; cannot safely claim parity without real Mac session tests. |
| Session changes and login/logout | IMPLEMENTED | PARTIAL | Windows WTS sessions and process session identity. Mac user mode observes its own `who`/UID state and native lock state; events are inferred from observed snapshots, not an all-user audit stream. |
| Device heartbeat / agent health | IMPLEMENTED | IMPLEMENTED | Shared heartbeat and collector health; Windows additionally reports SCM/service state and administrative stop state. Mac cannot report Windows SCM fields. |
| Network connections | IMPLEMENTED | UNSUPPORTED | Windows snapshot includes TCP connections. Mac employee user mode marks network snapshot unsupported; root deployment may provide wider collectors. Not an intrinsic macOS inability; it is a selected-mode gap. |
| USB/device observation | IMPLEMENTED | PARTIAL | Windows CIM device snapshots and USB categories; Mac system-level collector exists only in privileged/root scope. Employee user mode explicitly reports USB snapshot unsupported. |
| USB enforcement | IMPLEMENTED | MISSING | Windows has signed/persisted USB policy and native policy helper. No equivalent macOS policy enforcement implementation was found. |
| File activity | PARTIAL | PARTIAL | Shared watcher emits approved-directory `FILE_CHANGE` metadata only. Mac user mode restricts watched paths to its account and approved home locations; event semantics are not a complete filesystem audit. |

### D. Telemetry and backend

| Capability | Windows | macOS | Evidence and difference |
|---|---|---|---|
| Event schema and timestamps | IMPLEMENTED | IMPLEMENTED | `shared/contract.js` is common; event IDs are UUIDs and `occurredAt` must be UTC ISO (`Z`). OS collectors can differ in completeness and timestamp source. |
| Employee/device attribution | IMPLEMENTED | IMPLEMENTED | Agent omits company identity; backend derives device/company from credential and only maps events with the enrolled mapped identity. Mac UID and Windows SID mapping differ. |
| Encrypted offline queue, retry, ack, dedupe | IMPLEMENTED | IMPLEMENTED | Shared encrypted queue and uploader retain until acknowledged; server uses unique device/event ID and `skipDuplicates`. Transient offline delivery works in integration fixtures; actual Mac collector offline behavior not verified. |
| Health fields | IMPLEMENTED | PARTIAL | Same bounded health schema; Windows reports service control/admin state; Mac lacks those Windows-specific signals and user-mode unsupported collectors report as such. |
| Local operation grants and acknowledgments | IMPLEMENTED | MISSING | Windows `/operation` and heartbeat acknowledgments cover local grants and result status. Mac does not implement `SERVICE_STOP` / `AGENT_UNINSTALL` grant or acknowledgment path. |
| Dashboard / real-time updates | IMPLEMENTED | IMPLEMENTED | Shared backend endpoint events update dashboard device/event state and SSE notifications. Backend integration is not proof of platform-native event collection. |

### E. Zero Trust and enforcement

| Capability | Windows | macOS | Evidence and difference |
|---|---|---|---|
| Device trust / risk inputs | PARTIAL | PARTIAL | Both send compatible event families, but source availability differs. Risk analysis consumes attributed app usage/foreground and selected session evidence; it does not treat all process/network/USB/file observations as equivalent risk inputs. ML/risk behavior is shared backend logic. |
| Policy and account enforcement | IMPLEMENTED | PARTIAL | Windows has SYSTEM-mediated account controls and signed USB policy. Mac root deployment can use Unix account control after recovery-account preflight; user ZIP deliberately refuses privileged account control. No Mac USB policy equivalent found. |
| MFA approval workflow | IMPLEMENTED | PARTIAL | Main Admin fresh MFA and approval workflow exists for Windows management operations. Common dashboard/security MFA features may be platform-neutral, but corresponding Mac endpoint stop/uninstall grants are missing. |
| Monitoring pause/resume | IMPLEMENTED | PARTIAL | Shared configuration and local runtime state; Windows administrative stop is additionally persisted against recovery/startup bypass. Mac behavior and administrative semantics need native acceptance comparison. |
| Authorized service stop / uninstall | IMPLEMENTED | MISSING | Windows two-layer UAC + Main Admin grant; macOS launchd stop/uninstall is not centrally approved through that grant workflow. |
| Enforcement result and failure handling | IMPLEMENTED | PARTIAL | Backend records Windows grants, execution, failure, expiry and revocation states. Mac has ordinary health/monitoring state but lacks equivalent privileged-operation result state. |

### F. Privacy and employee transparency

| Capability | Windows | macOS | Evidence and difference |
|---|---|---|---|
| Employee monitoring disclosure | PARTIAL | IMPLEMENTED | Mac employee installer requires explicit `MONITOR` consent and stores disclosure version/time. Windows installation/configuration exposes controls and status, but equivalent install-time consent gate was not established in inspected path. |
| Browser title minimization | PARTIAL | PARTIAL | Titles are optional and separately approved; private-window restriction and browser companion proof exist. Mac additionally requires Accessibility permission; Safari titles unsupported. |
| Data minimization | IMPLEMENTED | IMPLEMENTED | Shared schema limits metadata, validates title/event size and excludes page contents. File collector records path/change metadata rather than file contents. |
| Local data retention/deletion | PARTIAL | PARTIAL | Windows keeps data unless explicit purge. Mac uninstall currently removes per-user queue/data root without an explicit purge prompt; retention outcome differs and risks dropping queued events. |
| Permission transparency | PARTIAL | PARTIAL | Windows UAC appears for privileged requests; Mac requires normal Keychain / optional Accessibility permissions. User-facing permission and unsupported-collector diagnostics differ. |
| Audit logging | IMPLEMENTED | PARTIAL | Server audit covers Windows privileged local operations. Mac admin revocation can be audited in dashboard, but local uninstall is not linked to a single authorization/execution record. |

### G. Packaging and deployment

| Capability | Windows | macOS | Evidence and difference |
|---|---|---|---|
| Employee-installable package | IMPLEMENTED | NOT VERIFIED | Current Windows ZIP has Windows service/native runtime and version 1.1.0 manifest. Current macOS ZIP inspected is explicitly a build kit (`employeeInstallable:false`), not the employee install kit. |
| Native helper/runtime files | IMPLEMENTED | PARTIAL | Windows ZIP contains ServiceHost, Node runtime, PowerShell/native helpers. macOS build kit contains Swift sources and pinned runtimes; employee kit compilation of arm64/x86_64 helpers requires a Mac. |
| Release manifest and file hashes | IMPLEMENTED | IMPLEMENTED | Current Windows `package-manifest.json` inventories SHA-256 per file. Mac build kit has `package-manifest.json`, SHA256SUMS and build-kit manifest. Its inventory proves build-kit content, not an installable employee product. |
| Reproducible/correct-host build | PARTIAL | PARTIAL | Windows release builder and Mac release builder enforce host-specific steps; timestamps and runtime/compiler/build environment limit byte-identical reproducibility. Current Mac artifact was generated on Windows by build-kit preparation, not native Mac build. |
| Update compatibility | IMPLEMENTED | PARTIAL | Windows updater validates staged allowlist and preserves enrolled data. Mac updater path exists and preserves enrollment/config/queue, but no accepted employee archive was present for package tests. |
| Signing/notarization and OS permissions | PARTIAL | PARTIAL | Windows local packaging is not a complete managed software distribution/signing acceptance record. Mac build supports optional signing; docs identify signed/notarized distribution and permission acceptance as release tasks. |

## 3. Native OS implementation details

### Windows

- **Service hosting:** `packaging/windows/ServiceHost.cs` starts/stops the Node worker through SCM. Service recovery settings and failure behavior are configured by the installer.
- **SCM boundary:** `install.ps1` sets a service DACL granting SYSTEM and Administrators full service rights while Users receive query rights (`0x2008D`). Static tests inspect the configured SDDL and protected file/task ACL logic. Only an actual installed service `sc.exe sdshow CyberOrbitAgent` plus standard-user stop attempts verifies the live DACL boundary.
- **Elevation and Main Admin authorization:** the request entrypoint calls native `Start-Process -Verb RunAs`; the elevated action then needs a fresh Main Admin operation grant. Windows administrator credentials remain in the Windows UAC path and are not read or transmitted by CYBERORBIT. UAC cancellation, credential entry and Main Admin denial were not witnessed on a two-account acceptance machine in the recorded evidence.
- **Credential and native observation:** DPAPI machine protection; CIM/WTS process/session/device/network data; C# process ownership and Windows desktop API. A Windows-host agent test did execute real snapshot/DPAPI and desktop helper checks.
- **Remaining security limit:** unrestricted local Administrator/SYSTEM can change service permissions, replace files or disable protections. The design boundary is standard employee accounts plus IT-controlled admin access, not defense against a fully privileged endpoint administrator.

### macOS

- **Launchd:** employee ZIP uses a LaunchAgent scoped to `gui/<uid>` with KeepAlive; root mode uses a separate LaunchDaemon and GUI LaunchAgent. Per-user mode only observes the logged-in employee's allowed scope. Root mode and user mode have distinct config, storage, permission and lifecycle behavior.
- **Privilege and authorization:** employee installation/uninstall runs as the logged-in account without sudo. Root deployment is configured by local root. Neither mode requests a Main Admin grant for daemon stop/uninstall. Local `sudo`/root authorization is an OS privilege boundary, not the same approval as CYBERORBIT Main Admin MFA.
- **Keychain:** compiled Swift helper reads/writes/deletes the enrollment credential in Keychain (user mode Login Keychain, root mode System Keychain). The native Keychain runtime test was skipped on Windows.
- **Desktop collection:** Swift/AppKit/NSWorkspace, CoreGraphics idle state, active-app observation and Accessibility AX title lookup. The Mac native tests check helper compilation/runtime and launchd parsing on macOS; those did not execute on this host. Safari title collection is unsupported by the current design.
- **OS-scope limitations:** employee user mode explicitly cannot collect system-wide network/USB/process/session scope or enforce Unix account control. These are install-mode limitations, not proof that macOS as an OS lacks such APIs. Root mode may provide broader collection/account-control capability, but still lacks Windows's operation grant flow and equivalent USB enforcement.

## 4. Test coverage and execution evidence

No tests were run for this audit. The following results are the latest recorded complete-suite results in the current work history; their scope is stated to avoid treating mocks as native proof.

### Agent tests

Latest complete agent suite on this Windows host: **115 total, 107 passed, 0 failed, 8 skipped**. This is Windows-host execution, not Mac execution or two-account production acceptance.

| Test file / case | What it verifies | Evidence type | Latest execution / native gap |
|---|---|---|---|
| `agent/test/windows.test.js` — “Windows actual CIM/WTS/USB/TCP snapshots and machine DPAPI roundtrip” | Queries actual Windows snapshot surfaces and performs DPAPI roundtrip. | Native Windows host | Passed in recorded agent suite; does not test a standard user's service-control denial. |
| `agent/test/windows.test.js` — “real Windows desktop helper reads foreground/idle/lock without window contents” | Runs Windows desktop helper against local session. | Native Windows host | Passed; does not validate all user-session/reboot cases. |
| `agent/test/windows.test.js` — local desktop channel authentication | Validates both directions and rejects wrong identity/key. | Local IPC integration | Passed; not a security boundary test against local admin. |
| `agent/test/windows-local-operation.test.js` — standard-user ACL / installer updater boundary | Inspects SDDL and installer/update preservation logic. | Static/source fixture | Passed; not installed SCM DACL acceptance. |
| `agent/test/windows-local-operation.test.js` — uninstaller validates authorization before destructive operations | Checks grant/action/device ordering and guard logic. | Static/mock | Passed; no actual elevation dialog or uninstall. |
| `agent/test/windows-local-operation.test.js` — request entry invokes native UAC | Checks `RunAs` entrypoint ordering. | Static/mock | Passed; no UAC prompt/cancel/credential interaction. |
| `agent/test/windows-service-hardening.test.js` — installer protects SCM/files/tasks | Checks configured protection rules. | Static/mock | Passed; verify live DACL on a dedicated Windows test host. |
| `agent/test/windows-updater-runtime.test.js` | Tests update allowlist/runtime closure. | Windows host integration | Passed in recorded run; does not establish production rollback across failures. |
| `agent/test/local-operation-auth.test.js`, `remote-stop.test.js` | Grant signatures, device/action/expiry/replay rules. | Mock/temp filesystem and crypto | Passed; backend/server integration exists separately; not a substitute for native executor test. |
| `agent/test/core.test.js` — encrypted queue restart/partial ack/offline retry | Retention of unacknowledged records and stable IDs. | Local integration with test transport | Passed; no power-loss/long offline fleet test. |
| `agent/test/macos-user.test.js` | User-mode config, UID mapping, allowed scope, refusal of unsupported privileged controls, queue behavior. | Mostly portable/mock | Passed where platform-independent; does not test launchd, Keychain, AppKit or actual ownership under macOS. |
| `agent/test/macos-runtime.test.js` — real process query; Keychain; flock; desktop samples/launchd parsing; AppKit active app | Native Mac process, credential, lock and desktop semantics. | Native macOS tests | **Five skipped on Windows** (`process.platform !== 'darwin'`). Must run on Mac. |
| `agent/test/macos-kit.test.js` | Kit inventory/path safety, architecture and employee-install gate. | Portable fixture/archive checks | Passed on Windows; cannot compile or validate actual Swift/Mach-O payloads. |
| `agent/test/release-package.test.js` — Windows/macOS archive checks | ZIP inventory, version, hashes and platform exclusions. | Archive test | Both release ZIP cases skipped in recorded full agent run because release archive environment variables were not supplied. Existing ZIPs were inspected read-only in this audit; package test was not re-run. |
| `agent/test/unix-account-control.test.js`, `unix-desktop.test.js` | Adapter behavior, policy and supervisor transitions. | Injected/mock adapters | Passing adapter tests are not native macOS user/account/launchd verification. |

The eight agent-suite skips recorded were platform/package gating: five Mac-native tests, one Unix-only secure ownership test on Windows, and two release ZIP validation cases without the archive environment variables. These skips are not passes.

### Backend tests

Latest recorded complete backend suite: **129 total, 127 passed, 0 failed, 2 skipped**. It uses the configured local test environment and database, not production data.

| Test file / case | What it verifies | Evidence type | Limit |
|---|---|---|---|
| `server/test/endpoint-agent-uninstall.test.js` — “AGENT_UNINSTALL requires Main Admin fresh MFA and completes once on its enrolled Windows device” | Fresh MFA, Windows device/action binding, completion/replay/revocation state. | Real local HTTP + disposable PostgreSQL; synthetic Windows endpoint | Does not execute Windows service stop or filesystem cleanup. No Mac counterpart. |
| `server/test/endpoint-agent-stop.test.js` — Windows agent stop workflow | Recent MFA, tenant/device scope, expiry, acknowledgment/audit. | Real local HTTP + disposable PostgreSQL | Backend operation contract only; does not show native UAC/service denial. |
| `server/test/macos-agent.test.js` — Mac contract over HTTP/PostgreSQL | Enrollment, heartbeat, offline replay, attribution, retention and revoke using Mac-shaped explicit events. | Real local HTTP + PostgreSQL, fixture event payloads | Not native Mac observation or launchd/Keychain test. The test is conditional on `DATABASE_URL`. |
| `server/test/risk-analysis.test.js`, related telemetry tests | Backend risk inputs and event attribution rules. | Backend tests and fixtures | Do not demonstrate equivalent input availability from each real endpoint. |

### Real-device acceptance evidence

- **Windows:** recorded actual native snapshot, DPAPI and desktop-helper tests passed on a Windows host. No recorded fresh two-account production acceptance output for installed service DACL, standard-user PowerShell/Services.msc denial, actual UAC cancel/credential prompt, Main Admin approval, or full authorized uninstall/revocation. Those checks remain **NOT VERIFIED**.
- **macOS:** no physical Mac/Swift runtime was available in this environment. Native Mac runtime tests were skipped. No Apple Silicon or Intel employee installation, Keychain permission, launchd crash/reboot, Accessibility, browser, update, or uninstall acceptance was recorded. These remain **NOT VERIFIED**.
- **Backend:** passing tests use local services/test database. They do not show the latest backend deployment is live or healthy.

## 5. Backend contract compatibility

### Shared event contract

`agent/shared/contract.js` defines contract version 1 and the common event shapes. Both agents normalize to `version`, `eventId`, `deviceId`, UTC `occurredAt`, `type`, and bounded `metadata`. The validator requires `occurredAt` ending in `Z`, UUID IDs, limits events to eight days old / five minutes future, and caps metadata at 4 KiB. The server validates each event in `server/services/endpoint-service.js` before persistence.

| Data/request | Windows payload/source | macOS payload/source | Compatibility finding |
|---|---|---|---|
| Enrollment | Platform `win32`, assigned device, verified Windows SID identity. | Platform `darwin`, assigned device, `uid:<n>` identity. | Common one-use token API; platform identity encoding intentionally differs. |
| Heartbeat | Agent version, collector/queue health, lifecycle; Windows service/admin state fields may be present. | Agent version and collector/queue/lifecycle health; user mode reports unsupported collectors and omits Windows SCM-specific meaning. | Same endpoint/schema; platform-specific optional health values. |
| Process events | Windows process/session snapshots with owner SID/session info. | User mode is current-UID filtered; root mode may have wider scope. | Same event shapes but not equivalent observation coverage. |
| Application usage/foreground | User32 helper/session identity. | AppKit/NSWorkspace helper; user account scope; browser title via AX under permission. | Shared event schema. Sampling, foreground proof and permission effects need device comparisons. |
| Session events | WTS login/logout/lock/unlock/session state. | User session snapshots plus native lock state; unknown is possible; login/logout inferred from observations. | Compatible event types, differing completeness and semantics. Unknown lock state must not be coerced to unlocked. |
| USB events | Windows device enumeration and category. | User mode unsupported; root mode may observe device inventory. | Common event type, but user package lacks comparable collector; no macOS enforcement API is wired. |
| File events | Approved directory watcher; names/relative path/change only. | Approved paths within permitted account scope; names/relative path/change only. | Shared schema; path permissions and coverage differ. |
| Network events | Windows TCP connection snapshot when enabled. | User mode unsupported; root mode can have wider snapshot scope. | Shared schema but unsupported in official user mode. |
| Authorization request/grant | Authenticated heartbeat/operation routes carry Windows local operation requests and results for `SERVICE_STOP` / `AGENT_UNINSTALL`. | No equivalent service-stop/uninstall local operation request. | Not feature-compatible. Backend explicitly limits local operation actions to Windows service devices. |
| Acknowledgments | Windows local operation result and enforcement reports are persisted against command/request state. | General lifecycle/health reports only; no privileged operation result. | Not compatible for privileged local operations. |
| Dashboard | Same backend device/event/dashboard APIs and server-side attribution. | Same. | Dashboard API compatibility is stronger than endpoint observation and management parity. |

Backend attribution is derived server-side from the enrolled credential/device. `endpoint-service.js` attributes identity-bearing process/application/session/file events only when event metadata identity matches the mapped device identity. Event IDs are deduplicated by database constraints/`createMany(skipDuplicates:true)`. Heartbeat uses server-side device credential validation and updates last-seen/health. USB notification explicitly reports connection observation, not confirmed file access or data transfer.

## 6. Prioritized macOS implementation gaps

Priority reflects the requested employee parity target, not a statement that every deployment must enable every OS capability.

### P0 — Critical

| Gap | Windows behavior | Current macOS behavior and exact missing functionality | Relevant files | Backend/API changes | Tests and Mac requirement | Recommended approach |
|---|---|---|---|---|---|---|
| Centrally authorized `SERVICE_STOP` | UAC elevation plus fresh Main Admin grant, device/action/expiry/nonce validation, execution result. | No local operation client/validator or service-stop executor in employee LaunchAgent path; stopping own LaunchAgent remains local account scope. | `src/local-operation-auth.js`, `src/local-operation-client.js`, `src/service.js`; Windows `packaging/windows/request-operation.ps1`, `windows-elevation.ps1`; Mac `src/macos-user-install.js`, launchd templates. | Existing backend currently only issues these actions to Windows service devices; add platform/mode-specific authorization only after product policy decision and contract review. | Unit/backend tests for all grant failures and replay; native Mac launchctl executor/authorization acceptance mandatory. | Add a shared operation authorization abstraction with a macOS adapter; require local administrator/root authorization where appropriate plus Main Admin MFA. Never treat one layer as the other. Define whether user LaunchAgent stop is an allowed management target. |
| Centrally authorized `AGENT_UNINSTALL`, revoke and preserve queued data | Windows validates approved grant, stops service, confirms stop, revokes server credential, then removes; data retained unless explicit purge. | Mac local uninstall removes user support root and Keychain credential; tells admin to revoke in dashboard; no server revoke confirmation and queue can be deleted with app data. | `packaging/macos/uninstall-user.sh`, `src/macos-user-install.js`, `src/user-revocation.js`; Windows `packaging/windows/uninstall.ps1`; backend `routes/endpoint.js`, `services/endpoint-service.js`. | Add Mac device operation issuance/completion and idempotent revoke only if API policy is expanded. | Regression for denied/expired/replayed/wrong-device/action, server down, stop failure, revoke success/failure, partial cleanup/recovery; physical Mac required for launchd/keychain/filesystem. | Mirror safe sequencing: elevated/admin gate + fresh Main Admin authorization, confirm daemon stopped, revoke, retain queue by default, then remove binaries; report partial status. Keep purge explicit and separately authorized. |
| Privileged user-mode data and device security boundaries | Machine service owns protected system data and standard users cannot alter service configuration. | Employee LaunchAgent and queue/config are owned by employee account; same employee can alter/remove the agent and its local data. | `src/macos-user-install.js`, `macos-user.js`, `credential-store.js`, `queue.js`. | None required for local ownership, unless adding signed device attestation/operation status. | Test owner/mode/symlink checks on Mac; standard account tamper tests mandatory. | Document mode's trust boundary precisely. For centrally managed tamper resistance use MDM/root deployment and protected root-owned data; do not describe user-owned LaunchAgent as employee-resistant. |

### P1 — High

| Gap | Windows behavior | Current macOS behavior and exact missing functionality | Relevant files | Backend/API changes | Tests and Mac requirement | Recommended approach |
|---|---|---|---|---|---|---|
| Comparable process/session/network/USB collection in the employee package | Machine service can observe WTS/CIM, network and USB at device scope. | Employee mode filters to own UID and explicitly reports network/USB unsupported; session visibility is user scoped. | `src/collectors/*`, `src/macos-user.js`, `src/macos-user-install.js`, `native/macos-desktop.swift`, `native/windows-snapshot.ps1`. | Event schema already accepts shared types; likely no schema change. Backend attribution/retention should be validated against broader event volumes. | Mac native collector tests on both supported CPU families; compare fixtures and dashboard counts with Windows. | Decide which system-level events are product requirements; if so package a signed/notarized privileged helper or managed root LaunchDaemon with least-privilege entitlements and explicit MDM deployment. Otherwise show unsupported state clearly. |
| macOS USB policy enforcement | Windows receives signed USB policy and invokes native policy helper. | No equivalent Mac policy enforcement module; observation may be available only root mode. | `src/usb-policy.js`, `src/service.js`, `native/windows-usb-policy.ps1`; Mac packaging tree. | Add policy API/action only after macOS enforcement semantics are defined. | OS/device matrix on real Mac and removable media; safety/recovery test mandatory. | Research supported macOS managed configuration/MDM policy controls; avoid claiming app-level USB block if OS policy is required. |
| Admin stop/resume parity | Windows persistent administrative stop prevents startup/recovery from resuming monitoring. | Mac has monitoring config and LaunchAgent restart behavior, but no matching persistent administrative operation/acknowledgment path. | `src/admin-stop-lifecycle.js`, `src/service.js`, `src/macos-user.js`, launchd templates. | Reuse explicit monitoring lifecycle state if policy requires server-managed pause; keep distinct from daemon stop. | Mock lifecycle and real launchd reboot/relogin tests. | Define monitoring pause vs agent service lifecycle as separate state machine, with server command expiry/ack and launchd recovery behavior specified. |
| Comparable employee install-time disclosure | Windows UI/scripts offer configuration, but no same explicit `MONITOR` install gate established. | Mac user installer requires disclosure acceptance and stores consent version/time. | `packaging/windows/install.ps1`, `src/macos-user-install.js`, Windows/Mac READMEs. | No schema change unless consent is to be centrally audited. | Installer interaction tests on both OSes; acceptance on Windows standard user/admin and Mac user. | Make disclosure and optional collector permission explanations consistent across the packages, while preserving platform-specific OS permission prompts. |

### P2 — Medium

| Gap | Windows behavior | Current macOS behavior and exact missing functionality | Relevant files | Backend/API changes | Tests and Mac requirement | Recommended approach |
|---|---|---|---|---|---|---|
| macOS release artifact confusion | Current Windows ZIP is an install/runtime package. | Current `CYBERORBIT-macOS.zip` is a builder kit; manifest explicitly says non-installable. | `packaging/release/build-macos.sh`, `packaging/macos/prepare-build-kit.js`, `packaging/macos/build-install-kit.js`, `MACOS-VERIFICATION.md`. | None. | Package tests against the actual employee kit and build kit; native Mac build mandatory. | Use distinct release names for builder kit and employee-installable output; publish only Mac-built employee kit as the employee package. |
| Mac update rollback/recovery evidence | Windows staged update allowlist and rollback are tested. | Mac updater protects paths/preserves data, but rollback and package acceptance are not evidenced here. | `packaging/windows/update-installed.ps1`, `packaging/macos/update-user.js`. | None. | Failure injection and update/restart test on Mac; architecture-specific checks. | Add staged update/atomic switch and previous-version recovery if current updater lacks it; test interruption at each transition. |
| Native lifecycle acceptance across user sessions | Windows service/watchdog has native tests but no formal two-account acceptance. | LaunchAgent behavior depends on GUI login/session and has no recorded native acceptance. | Windows `ServiceHost.cs`, `desktop-watchdog.ps1`; Mac LaunchAgent generation and `macos-runtime.test.js`. | None. | Must test login/logout, reboot, crash, fast user switching and offline reconnection on Mac; Windows standard/admin acceptance remains needed. | Create platform-specific acceptance checklists with outputs and acceptance records; do not substitute source tests. |
| Package signatures and distribution permissions | Windows service package has manifest hashes; managed signing/distribution acceptance not established. | Mac optional code signing and notarization remain release work in docs. | `packaging/release/*`, Mac `build-install-kit.js`, `MACOS-VERIFICATION.md`. | None. | Signing, Gatekeeper and update signature tests on real target OS versions. | Define release signing identities, notarization/stapling, update trust policy and reproducible build provenance. |

### P3 — Low

| Gap | Windows behavior | Current macOS behavior and exact missing functionality | Relevant files | Backend/API changes | Tests and Mac requirement | Recommended approach |
|---|---|---|---|---|---|---|
| Diagnostics and unsupported capability parity | Windows health includes SCM/service state and collector diagnostics. | Mac health differs by user/root mode and unsupported fields, with less matching service-state detail. | `src/health.js`, `src/service.js`, `src/macos-user.js`, `src/windows-service-diagnostic.js`. | Keep optional health fields bounded; add only stable cross-platform semantics. | Contract tests plus Mac-generated health payload and dashboard review. | Normalize health vocabulary while preserving explicit OS-specific fields and `unsupported` states. |
| User-facing installation/update/uninstall docs | Windows production acceptance is detailed. | Mac docs distinguish build kit and employee kit but current ZIP filename is misleading and local uninstall/revocation expectations differ. | `agent/README.md`, `agent/packaging/macos/*README*`, `MACOS-VERIFICATION.md`. | None. | Documentation/package link verification. | Separate builder instructions from employee instructions; explicitly state uninstall server-revocation and queue-retention behavior after P0 fix. |

## 7. Packaging and current archive inspection

Read-only inspection of the existing archives (no extraction to disk, rebuilding or modification):

| Archive | Size | SHA-256 | Manifest evidence | Assessment |
|---|---:|---|---|---|
| `agent/dist/CYBERORBIT-Windows.zip` | 35,011,951 bytes | `a4614ded252ffcdf34a74027bf8c9fbe5d4c84a4d1dd4d7123a54369cd7969c3` | 69 ZIP entries; `package-manifest.json` platform `windows`, version `1.1.0`, timestamp `2026-11-03T14:47:40.6773594Z`, per-file SHA-256 inventory. Includes `CyberOrbitService.exe`, `ServiceHost.cs`, `windows-elevation.ps1`, `request-operation.ps1`, updated installer/updater/uninstaller and `src/local-operation-auth.js`. | Package contents and manifest are consistent with Windows local-operation flow. Audit did not rerun the ZIP release test; no live install was performed. |
| `agent/dist/CYBERORBIT-macOS.zip` | 100,454,214 bytes | `10ed03fca20f4a29f87c34718b2d890d97a6f6194319624161224be29a197dc9` | 85 ZIP entries under `CYBERORBIT-macOS-Build-Kit`; `build-kit-manifest.json`: `kind: macos-build`, `platform: darwin`, `employeeInstallable: false`, agent `1.1.0`, Node `v22.23.3`, architectures `arm64`/`x64`, `generatedOn: win32`, dated 2026-11-02. | This archive is a Mac builder handoff, not an employee install package. It has Swift sources and pinned runtimes, not compiled native employee payloads. |

The official `packaging/release/build-macos.sh` refuses to run outside Darwin and builds `CYBERORBIT-macOS-Install-Kit.zip` after native helper compilation and tests. The Windows `prepare-build-kit.js` path creates the non-installable build kit. Therefore, do not distribute the current macOS-named ZIP to employees as the installed agent package. The current workspace did not contain/test an employee-installable Mac release archive for this audit.

## 8. Recommended implementation sequence

1. **Resolve Mac uninstall security and data semantics (P0):** decide whether Mac employee uninstall must be centrally approved; implement Main Admin grant, native admin boundary, stop confirmation, server revocation, explicit partial-failure reporting, and queue retention before deleting files.
2. **Define the macOS service target (P0):** choose whether the protected managed target is a per-user LaunchAgent or MDM/root LaunchDaemon. Document the privilege boundary and avoid claiming a user-owned agent resists that user.
3. **Extend backend authorization deliberately (P0):** platform/mode-bind operations, retain fresh MFA, exact action/device binding, expiry, nonce/replay defense, idempotent revoke and auditable outcomes. Preserve the distinction from monitoring pause/resume.
4. **Build and test the Mac employee artifact on Mac (P2 gate):** on Apple Silicon and Intel, compile/sign native helpers, run macOS suite, verify inventory and hashes, and give the employee kit a distinct release artifact name. Keep build kit and employee installer separate.
5. **Make employee-scope collection gaps explicit (P1):** decide which process/session/network/USB capabilities need system scope; implement via a signed, least-privilege managed helper/MDM where justified, or document unsupported capability in product health and UI.
6. **Define USB policy for macOS (P1):** use supported OS management controls if enforcement is required; implement observation and policy acknowledgment without implying that observation blocks devices.
7. **Align monitoring state and consent (P1):** specify monitoring pause/resume and restart behavior on both platforms; align employee disclosure and permission explanations.
8. **Execute platform acceptance before parity claims:** Windows standard-user/admin UAC+SCM acceptance; Mac standard-user install, Keychain, launchd lifecycle, permissions, scope, update, uninstall, queue and revocation. Capture actual command output and supported OS/hardware versions.
9. **Close operational gaps (P2/P3):** update rollback, signed release provenance, health vocabulary, docs, and dashboard diagnostics.

## 9. Features that should remain OS-specific

- Windows SCM service host, service SDDL/ACL, UAC `RunAs`, DPAPI, WTS, CIM and Windows USB policy.
- macOS LaunchAgent/LaunchDaemon and launchctl lifecycle, Keychain, AppKit/NSWorkspace, Accessibility authorization, CG idle state, Apple Silicon/Intel native binaries, signing/notarization and MDM deployment.
- User identity encoding (Windows SID vs macOS UID) and OS-specific permission/health states.

Keep the event/API contract and authorization policy semantics shared where possible, but use platform adapters and explicit unsupported states rather than pretending native controls are identical.

## 10. Audit limits

This report's original comparison tables are a historical audit snapshot. The implementation addendum and `agent/docs/MACOS-VERIFICATION.md` record later changes and current test evidence. It is not a production security certification. A Mac machine was unavailable; the current Mac-named archive is a build handoff; no employee Mac ZIP, live Mac telemetry, physical Mac test, or deployed-backend health was verified. Windows service DACL acceptance under a separate standard account, real UAC interaction and full authorized stop/uninstall also require dedicated Windows acceptance. Unrestricted local Administrator/root/SYSTEM access can ultimately tamper with endpoint software on either OS.

## Implementation addendum — 2026-11-03

The employee LaunchAgent `AGENT_UNINSTALL` path has since been implemented using the existing backend operation contract. macOS employee local operations allow only `AGENT_UNINSTALL`; Darwin `SERVICE_STOP` remains unsupported. The shared 120-second HMAC grant binds request, device, UID, action and nonce. The employee workflow waits for backend grant acceptance, consumes the nonce once, validates install paths, boots out the LaunchAgent, waits for its exclusive service lock to release, and only then completes the request. Completion revokes the credential transactionally. The queue, enrollment marker, configuration and logs are retained. Failed pre-revocation execution reports `FAILED` when the backend is reachable; partial post-revocation cleanup reports the failed step, retains local data, and can resume from the employee kit's independent uninstall command.

The existing monitoring lifecycle control is now consumed by the employee LaunchAgent as well: authenticated `STOP_AGENT` and `START_AGENT` commands pause/resume collection while heartbeat control remains active. Darwin requests require Main Admin plus the route's recent-MFA check. This lifecycle pause does not stop the LaunchAgent or revoke the device credential. Its state is in employee-owned storage and therefore is not resistant to the account owner. The employee updater now attempts automatic rollback on restart/heartbeat failure: retain the failed app tree, restore the previous app atomically, and restart the previous version; the launchd recovery behavior still requires Mac acceptance.

This applies only to the employee LaunchAgent and supported CYBERORBIT uninstall commands. The same-account employee still owns that LaunchAgent and can bypass the supported commands with direct OS tools or alter user-owned files; this is not protection against the account owner. The optional root LaunchDaemon remains a separate local root/MDM-managed workflow and has no Main Admin grant integration.

Automated evidence added after this audit: current detailed counts and handoff checksum are recorded in `agent/docs/MACOS-VERIFICATION.md`. The Mac-specific checks remain source-level/platform-independent on Windows, with native Mac checks skipped; no test here establishes actual launchd, Keychain, AppKit, TCC, device inventory, update recovery or uninstall behavior on macOS. Existing release ZIPs were preserved. The refreshed handoff remains `employeeInstallable:false`; it is not an employee release artifact. The employee payload builder allowlists Mac employee components and rejects Windows packaging/native helpers plus optional root LaunchDaemon plists. Run the native suite and employee install/update/uninstall acceptance on supported Macs, then build and validate a replacement employee kit before distributing it.
