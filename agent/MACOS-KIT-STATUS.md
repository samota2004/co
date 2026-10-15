# Current macOS kit status

## 15 October 2026 — application-usage update prepared

Current artifact:
`C:\Users\priya\OneDrive\Desktop\capstone\agent\dist\CYBERORBIT-macOS-Build-Kit.zip`

SHA-256: `c66500fea0c7ea7c42099ad62395f6bba9a046d98ce9b4bb3294f8314c2ca1cf`.
The refreshed build kit includes desktop pipeline revision 2, a no-enrollment
`Update-CYBERORBIT.command`, and `Diagnose-Application-Usage.command`.

The final combined agent/macOS-contract test run passed 78 tests with six skips
(five Mac-native tests and Unix-only ownership testing) and zero failures.
JavaScript/PowerShell checks covered 65/15 files; 14 macOS shell scripts parsed.
The signed IPC/aggregation/queue/HTTP/PostgreSQL/dashboard integration used
simulated native samples; it does not establish real Mac runtime success.

Extract this new build kit into a fresh folder on your Mac and run
`Build-Mac-Install-Kit.command`. Extract the resulting
`output/CYBERORBIT-macOS-Install-Kit.zip`; run `Update-CYBERORBIT.command` in the
already-enrolled employee account. Credentials/config/assignment/queue and the
installed Keychain helper are preserved. Do not uninstall or re-enroll.

The reported application-usage incident remains **pending real Mac/dashboard
verification**. Follow [the exact update and verification guide](packaging/macos/APPLICATION-USAGE-UPDATE.md)
and return the diagnostic output plus a fresh usage record from the dashboard.

## Historical snapshot — 14 October 2026

The resumed audit preserved existing application/UI edits and inspected the
current packaging, agent, dashboard contract, runtime archives and generated ZIP.

**Generated here:**
`C:\Users\priya\OneDrive\Desktop\capstone\agent\dist\CYBERORBIT-macOS-Build-Kit.zip`

This 95.8 MiB ZIP is for the Mac builder. It includes verified official Node
v22.23.3 archives for Apple Silicon and Intel, public agent source, test files and
double-click build/install commands. It is explicitly not employee-installable;
compiled Swift helpers must still be built on your Mac. Its SHA-256 is
`8561c26268621ea0f15dc84515dad5c088aad0efc3d45eae212a96025062ddfc`.
The adjacent `.sha256` file contains that checksum. Prior generated artifacts
were preserved under `.previous-...` names inside `agent/dist`.

## Next action on your Mac

1. Copy this ZIP and its checksum to the Mac; extract into a folder owned by the
   logged-in build account. Apple Command Line Tools must be installed there.
2. Double-click `Build-Mac-Install-Kit.command` inside the extracted folder.
   No separately installed Node is needed. The build compiles both helper
   architectures and executes the native tests for the build Mac architecture.
3. The output is `<extracted-build-kit>/output/CYBERORBIT-macOS-Install-Kit.zip`
   and its SHA-256 file. This employee ZIP does **not yet exist on this Windows
   workspace**. Validate it on Apple Silicon and Intel before distributing.
4. Employees extract the output ZIP and double-click
   `Show-Employee-Identity.command` to obtain their identity for assignment, then
   `Install-CYBERORBIT.command`. They accept the disclosure with `MONITOR`, enter
   the assigned device UUID, and paste the token into the hidden prompt.
   Username, UID, hostname and architecture are discovered automatically.
5. Approve normal Keychain access. The installer registers the per-user
   LaunchAgent and waits for a fresh authenticated heartbeat. Terminal may be
   closed afterward. Reopening the installer preserves an existing enrollment.
6. Double-click `Check-CYBERORBIT.command` to inspect launchd/heartbeat status.
   The administrator confirms the employee, assigned UUID, mapped UID, CONNECTED
   status and current heartbeat in Devices. Heartbeats normally recur every
   30 seconds. Optional title collection requires explicit local consent,
   dashboard approval, Accessibility and a registered browser companion.

Browser-title runtime acceptance remains pending on a real Mac. Safari titles
are unsupported. Employee installation needs no sudo/source editing; permissions
must be granted normally. Detailed limits are in `packaging/macos/USER-INSTALL.md`.

## Current verification results

| Check | Result |
|---|---|
| Complete agent regression suite | 66 passed, 6 skipped, 0 failed |
| Mac packaging/control, HTTP/PostgreSQL contract and risk tests | 28 passed, 5 skipped, 0 failed |
| Final module-config rejection and employee-control tests | 18 passed, 1 skipped, 0 failed |
| Syntax checks | 61 JavaScript files, 15 PowerShell scripts, 12 macOS shell scripts passed |
| Refreshed Windows distribution | ZIP/install-kit source-match tests passed |
| Generated Mac Build ZIP audit | CRC and SHA-256 passed; source files match; no enrollment state/.env; executable command mode 0755 |
| Official runtime archive binaries | Mach-O CPU headers match arm64/x86_64 |

Mac/Unix skips are required platform checks. Windows duplicate-desktop testing
also skipped because an installed collector already owns the session. None is
represented as successful Mac runtime verification. No deployment, live employee
enrollment, Swift compilation or real browser testing occurred on this host.

The packaging now rejects a missing root ES module configuration before employee
enrollment; the audit added that guard and test. Other existing changes remain.
