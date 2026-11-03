# macOS employee-agent verification — 14 October 2026

## 15 October: application-usage incident update

Desktop pipeline revision 2 is implemented, with explicit locked/unlocked/unknown
states, positive own-console/active-app/UID validation, AppKit application event
loop initialization, signed control bootstrap, observable native-control receipt,
serialized usage aggregation/reset/flush and local queue/upload diagnostics.
See [the exact update and runtime procedure](packaging/macos/APPLICATION-USAGE-UPDATE.md).
The updater preserves existing enrollment/config/queue and the installed
Keychain helper; it never requests a new token.

Portable regressions cover switches, idle/lock/stale gaps, threshold/shutdown
flush, unknown-state privacy, control receipt and legacy Windows/Linux samples.
The real local HTTP/PostgreSQL test now passes simulated native samples through
signed IPC, the production aggregator and encrypted uploader, and verifies an
attributed 30-second usage event in the actual dashboard API response.
This is explicitly **not real macOS observation evidence**.
Five native Mac tests (including enabled AppKit foreground observation) skip on
this Windows machine. The incident remains pending until the affected Mac
produces fresh dashboard `APPLICATION_USAGE` events and its lock/idle tests pass.

Implementation is in the repository. **Production acceptance is not complete**:
this workspace runs Windows and provides no macOS runtime or Swift/macOS SDK.
No production enrollment token was requested or consumed, and nothing was
deployed to the live Render backend. Native Mac distribution archives must be
built and validated on Mac build machines.

## Double-click kit and resumed-work audit

The Windows-generated artifact is now `agent/dist/CYBERORBIT-macOS-Build-Kit.zip`.
It includes the current public agent sources, double-click commands, tests and
SHA-256-pinned official Node v22.23.3 archives for Apple Silicon and Intel. Its
manifest explicitly marks it **not employee-installable**. No compiled Swift
helpers are available on this Windows host.

On your Mac, extract that ZIP and double-click `Build-Mac-Install-Kit.command`
in a logged-in build account with Apple Command Line Tools. The build compiles
both helper architectures, checks executable headers, runs build-Mac native and
privacy tests, and generates `output/CYBERORBIT-macOS-Employee.zip`. Employees
extract the output ZIP, run `Validate-CYBERORBIT-Package.command`, then double-click
`Install-CYBERORBIT.command`. The validator checks inventory/hash integrity,
CPU/OS/runtime and GUI launchd prerequisites without installing anything.
No Node installation or development tools are required on employee computers.

The resumed-work audit verified the existing build ZIP's CRC, SHA-256, executable
command permissions, absence of source drift, and both official runtime binary
architectures. Updated kit verification also rejects missing/incompatible root
ES module configuration before enrollment. ZIP regeneration preserves the earlier
generated artifact separately; it does not change an installed agent.

Executed again on Windows: 28 passed/5 skipped/0 failed for macOS packaging,
employee controls, native-test gating, real HTTP/PostgreSQL enrollment/dashboard
integration and risk analysis; the final module-guard/employee suite passed
18 tests with one Unix-only skip. Syntax checks passed for 61 JavaScript files,
15 PowerShell scripts and 12 macOS shell scripts. Native Mac/browser acceptance
remains pending; existing frontend/user edits were preserved.

## Executed automated checks

| Check | Observed result |
|---|---|
| Complete agent suite: `node --test --test-concurrency=1 agent/test/*.test.js` | 60 passed, 6 skipped, 0 failed (66 tests) |
| Backend enrollment/macOS/risk/process-view/monitoring-state suite | 18 passed, 0 failed |
| Follow-up macOS/Windows/Unix desktop + macOS HTTP contract suite after helper lifecycle changes | 25 passed, 2 skipped, 0 failed |
| Final employee consent/privacy suite after consent enforcement | 12 passed, 1 skipped, 0 failed |
| JavaScript/PowerShell syntax | 56 JavaScript files and 15 PowerShell scripts passed |
| macOS installer/uninstaller and Unix build shell parsing | Git Bash `-n` passed for each script |
| Production web build: `npm run build` | Passed; Vite bundle size advisory remains |
| Windows distribution rebuild | Fresh Windows ZIP/install-kit checked against source by release tests |

The full agent run preceded final additions to consent validation; the focused
macOS user suite and release package check are rerun after that addition. The
six full-suite skips were four real Mac tests, the Unix-only ownership/link test
on Windows, and Windows duplicate-desktop testing because an installed collector
already owns the session. Skips are not evidence that a capability works.

Tests initially encountered sandbox subprocess restrictions (`EPERM`); they were
rerun with execution approval. The initial agent run also detected stale Windows
release copies and an old test's employee-console authentication assumption.
Packages were rebuilt; the integration fixture now uses the current administrator
console policy while checking employee attribution at the service layer.

## Browser-title evidence

Automated on this host:

- Both local and dashboard approval gates; rejected non-browser/unbounded title
  metadata; valid compatible `APPLICATION_USAGE` records.
- Extension VM: no title query before agent approval; private windows bypass tab
  title queries; denied controls stop queries.
- Fresh normal-window proof accepted; missing, stale, private, unfocused and
  mismatched proof rejected; title matching checked.
- Native framing limits; IPC key/identity rejection; signed controls.
- Encrypted queue restart and stable event IDs; real HTTP/PostgreSQL title
  ingestion, employee attribution, administrator dashboard query and seven-day
  title-field retention.

**Not executed:** Accessibility granted/denied on a real Mac; browser-native-host
launch in Chrome/Edge/Firefox/Brave/Chromium; rapid normal/private-window races;
real AX title reads; localized browser titles. These are explicit rollout gates.
Safari titles are unsupported in this distribution; application identity remains
supported. The helper reports that lack of private-window confirmation instead
of collecting unverified Safari titles.

## Real backend integration scope

The macOS test uses real local HTTP and disposable PostgreSQL schemas, not a
mock database. It tests account/device mismatch rejection without token
consumption; single-use enrollment; authenticated heartbeat/version/permission
health; encrypted offline restart/replay; process, foreground, usage, session and
file records; durable deduplication; employee attribution; administrator scope;
CONNECTED dashboard status; title retention; and revoked credential rejection.
Its events are explicit fixtures. It is not evidence of real macOS collection.

The Windows integration uses actual Windows process observations, HTTP,
PostgreSQL, encrypted queue replay, deduplication, administrator dashboard
access and revocation. Actual Windows CIM/WTS/USB/TCP and DPAPI tests also passed.
Existing Linux/root-macOS account-control and supervisor regression tests passed;
their platform execution was mocked on this Windows host.

## Pending Mac acceptance

Run `npm run test:macos` on a logged-in standard-account Mac with the existing
test database configuration. `agent/test/macos-runtime.test.js` compiles Swift
helpers and tests real own-UID processes, disposable Keychain storage/removal,
flock duplicate exclusion/release, generated plist parsing and desktop samples
without unapproved titles. Those four tests intentionally skip on other OSes.

Then execute the acceptance checklist in
[`USER-INSTALL.md`](packaging/macos/USER-INSTALL.md) on both Apple Silicon and Intel:
standard-account installation/enrollment, real login/logout/background behavior,
crash recovery, pause, offline restart/reconnection, permission changes, private
window exclusion, file isolation, revocation persistence and secure uninstall.

Release limitations: polling misses brief processes; final logout upload is best
effort; lock indication can be unavailable and is then reported degraded; macOS
permissions may require normal company provisioning; Safari titles and user-mode
privileged account/device-wide collectors are unsupported; signed/notarized
distribution and persistent browser extension publication remain release tasks.

## 3 November 2026: authorized employee uninstall implementation

The employee LaunchAgent uninstall entry now submits `AGENT_UNINSTALL` through
authenticated local IPC and waits for a signed, short-lived Main Admin grant. It
validates device, UID, exact action, expiry and nonce, consumes the grant once,
boots out the per-user LaunchAgent, and waits for its service lock to release
before asking the backend to revoke the credential. The encrypted queue,
enrollment marker, configuration and logs remain on disk. The optional root
LaunchDaemon is a separate local root/MDM-managed deployment and is not handled by
the employee workflow. A same-account employee can still tamper with their
user-owned LaunchAgent or use direct macOS tools; this is not a privileged
anti-tamper boundary.

Automated coverage passed on Windows for grant binding/expiry/replay, authorization
ordering, failed shutdown, backend failure, queue/enrollment retention and partial
cleanup recovery. Backend HTTP/PostgreSQL integration passed for synthetic Windows and
macOS device records. If confirmed revocation is recorded but cleanup is partial,
the independent employee-kit uninstall command resumes local cleanup without
requesting another grant; the queue and enrollment marker remain. This is not
macOS-native acceptance. The Mac LaunchAgent,
Keychain, launchctl shutdown, lock wait, file ownership and both architecture
install workflows still require testing on supported physical Macs. No employee
package was generated in this workspace; the existing ZIPs were preserved pending
that verification.
The existing trained model lacks the complete CERT feature set, so compatible
contextual risk analysis remains available without fabricated model inference.

The runtime can only learn a remote revocation after connectivity returns.
Keychain/UID checks protect employee isolation but do not constitute hardware or
same-user anti-tamper attestation. No OS security protection is bypassed.

## Employee release preparation update — 3 November 2026

The Mac employee builder now copies only Mac helper sources and employee-mode
packaging support into its payload. Its package validator rejects Windows
packaging/native helpers and the optional root LaunchDaemon plists. Synthetic
package tests pass 7/7; the focused `npm run test:macos` suite passes 42 tests,
with 6 skipped and no failures; and the full agent suite passes 121 tests with
8 skipped and no failures on Windows. The focused skips include five tests requiring native Mac
process/Keychain/flock/AppKit/launchd behavior, one Unix ownership test, and two
additional release-archive checks in the full suite because no employee ZIP was built.

An updated builder handoff was prepared outside `agent/dist` at
`%TEMP%/CYBERORBIT-macOS-Build-Kit-Authorization-Updated-v2.zip`. Its SHA-256 is
`b7debed4a414344be3d9bc9456f8043cfdccbe0cbbe6d37823452d45445a17c5`; its build
manifest remains `employeeInstallable:false`. All 88 files listed in its source
manifest matched their SHA-256 values, and no secret-like paths were present.
This handoff is for a Mac builder and is not an employee release. The employee
ZIP, native runtime, install/update/reboot/monitoring/telemetry tests, and Main
Admin uninstall acceptance remain blocked until run on supported physical Macs.
The original Windows and macOS release ZIPs were not modified.

## 4 November 2026: final Mac build handoff

The self-contained Windows-generated Mac build handoff is
`%TEMP%/CYBERORBIT-macOS-Build-Kit-Final-Testing-v7.zip` (100,477,726 bytes;
SHA-256 `b4e89a558ae26e7377b9d9e6d57019b4b3488fb83a811b756dc3c04e4318bd80`).
It includes the three required Swift helper sources, pinned Node archives for
arm64 and x86_64, the complete employee build inputs, and the 27-point Mac
acceptance guide. Its manifest marks it `employeeInstallable:false`; root
LaunchDaemon plists are absent. Clean extraction and Windows-host tests passed.
This is not an employee ZIP and does not evidence native compilation, signing,
notarization, or Mac installation.

From the extracted `CYBERORBIT-macOS-Build-Kit` folder on a logged-in Mac with
Xcode Command Line Tools, run `./Build-Mac-Install-Kit.command`. Expected output
is `output/CYBERORBIT-macOS-Employee.zip` plus its `.sha256` sidecar. After
extracting that employee ZIP on a clean Mac, run
`./Validate-CYBERORBIT-Package.command` before `Install-CYBERORBIT.command`.
