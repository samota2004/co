# macOS employee-agent verification — 14 October 2026

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
privacy tests, and generates `output/CYBERORBIT-macOS-Install-Kit.zip`. Employees
extract the output ZIP and double-click `Install-CYBERORBIT.command`.
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
The existing trained model lacks the complete CERT feature set, so compatible
contextual risk analysis remains available without fabricated model inference.

The runtime can only learn a remote revocation after connectivity returns.
Keychain/UID checks protect employee isolation but do not constitute hardware or
same-user anti-tamper attestation. No OS security protection is bypassed.
