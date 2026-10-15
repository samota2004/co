# Application-usage update: runtime verification pending

This update is prepared for the existing enrolled employee installation. It has
not been run on the affected Mac from this Windows workspace. Do not consider
the reported issue resolved until fresh `APPLICATION_USAGE` events from that
Mac are visible in the administrator dashboard.

## Findings and changes

The old health string replaced more specific foreground/control diagnostics.
It did not prove that `activeApplication=true` reached the native process or that
the foreground PID passed the same-UID check. The helper queried AppKit from a
plain Foundation run loop, without an initialized non-activating NSApplication.
The service also retained pending duration across idle/missing samples. These
are code-path findings, not a confirmed root cause on the affected Mac.

The revised helper initializes `NSApplication` with prohibited activation, runs
its event loop/common-mode timer, and uses `frontmostApplication` with a unique
active-application fallback. It validates foreground process ownership and the
employee's primary console via SystemConfiguration/CGSession. It reports which
stage rejected an observation. There is no fixed employee username, UID or host.
Apple documents the main-run-loop behavior of
[NSRunningApplication](https://developer.apple.com/documentation/appkit/nsrunningapplication)
and the primary-console scope of
[SCDynamicStoreCopyConsoleUser](https://developer.apple.com/documentation/systemconfiguration/scdynamicstorecopyconsoleuser(_:_:_:)).

Lock states are explicit: locked, unlocked and unknown. Missing lock information
never becomes `locked:false`, `SESSION_UNLOCK` or an unlocked health claim.
Unknown state can support application observations only when independent console,
active-application, same-UID and fresh-control checks pass. Known locked, inactive
console, sleep, idle, invalid ownership and stale controls exclude usage. Browser
titles additionally require a known unlocked state and the existing permissions/
privacy gates. Lock detection itself remains a platform limitation when its OS
indicator is absent; actual lock/unlock acceptance is part of the test below.

The Node helper obtains authenticated controls before spawning the native helper
and forwards the explicit application flag over its private stdin pipe. Native
samples acknowledge applied/fresh controls. Diagnostic snapshots have no title,
credential, token or page contents.

The shared aggregator flushes the previous app on switches, resets new-app
duration, emits at 30 observed seconds, and flushes already-observed partial
intervals on idle, missing/stale samples and graceful shutdown. It excludes gaps
over five seconds and does not carry idle or locked intervals into the next app.
Backend contracts and employee attribution remain unchanged.

## Build and update without re-enrollment

1. Transfer this newly generated file and its adjacent `.sha256` to the Mac:

   `C:\Users\priya\OneDrive\Desktop\capstone\agent\dist\CYBERORBIT-macOS-Build-Kit.zip`

2. Extract it into a **new folder**. Do not reuse an earlier extracted build
   directory, whose output/bootstrap directories are deliberately preserved.
3. In a logged-in Mac build account with Apple Command Line Tools, double-click
   `Build-Mac-Install-Kit.command`. It uses the bundled Node runtime and compiles
   both Apple Silicon and Intel helpers. Native tests now include an enabled
   own-foreground observation; they do not stop an existing employee helper.
   Do not distribute output if compilation/native tests fail.
4. Extract the generated employee ZIP:

   `<extracted-build-kit>/output/CYBERORBIT-macOS-Install-Kit.zip`

5. In the **already enrolled employee's graphical account**, double-click
   **`Update-CYBERORBIT.command`**. Use no sudo. Do not uninstall, delete data,
   assign another employee, or issue another enrollment token.
6. The updater stages new code, stops the current user LaunchAgent, acquires its
   exclusive lock, swaps the app tree and starts the same job. It preserves:
   `config.json`, `data/`, encrypted queue, helper capability, Keychain credentials,
   device assignment, installed Node runtime and the exact installed Keychain
   helper binary. The previous app is retained at the printed
   `~/Library/Application Support/CYBERORBIT/app.previous-<transaction-id>` path.
   It waits for a fresh heartbeat; this is not application-usage acceptance.
7. A failed build/update preserves its output and backups. If startup fails,
   inspect logs and use the installed `start` command below. Do not re-enroll.

## Verify actual usage

Ensure dashboard collectors are resumed and active application collection is
enabled. In the employee's active console, interact with a normal application
for 45 seconds, then switch to another application and use it for 10 seconds.
Keep the computer unlocked and avoid going idle for a minute.

Double-click `Diagnose-Application-Usage.command` from the new employee kit, or:

```sh
orbit_root="$HOME/Library/Application Support/CYBERORBIT"
"$orbit_root/app/runtime/node" "$orbit_root/app/src/macos-user-install.js" desktop-status
launchctl print "gui/$(id -u)/com.cyberorbit.user-agent"
tail -n 40 "$orbit_root/logs/launchd.log"
```

The current employee identity should match `id -u` (the reported test account
will show `uid:502`; it is not configured in source). Check these fields:

| Field | Expected evidence |
|---|---|
| `revision` and `lastSample.helperRevision` | Both `2`; otherwise code/helper mismatch |
| `requestedControls.activeApplication` | `true`; otherwise paused/disabled in effective configuration |
| `lastSample.activeApplicationApplied` | `true`; proves native control receipt |
| `lastSample.controlFresh` | `true`; false means missing/delayed IPC control delivery |
| `lastSample.consoleActive` | `true` while this employee uses the console |
| `lastSample.pid`, `foregroundOwned`, `activityEligible` | Positive PID, `true`, `true` while using a normal app |
| `lastSample.sessionState` | `unlocked` or explicitly `unknown`; unknown is never an unlock assertion |
| `queuedUsage` / `lastQueuedUsage` | New nonzero count/duration after interaction |
| `lastAcceptedUsage` | Event ID and current acknowledgment time, with `occurredAt` after this update |

`desktopHealth` explains disabled controls, stale controls, missing AppKit app,
ownership-query failure or another UID instead of reporting only lock uncertainty.
Snapshots refresh at most every 15 seconds and immediately after a usage upload
acknowledgment. An old/replayed queued record is not proof of new collection.

As administrator, open **Devices → Installed endpoint agents**, select this Mac
in the activity-device filter, choose **Application usage**, and refresh. Open
the application's card. Confirm a **new** `APPLICATION_USAGE` entry with nonzero
duration, the correct Mac/employee and a timestamp after the update. Check the
second app separately to confirm duration was not carried over.

For exact event matching, the dashboard response's `events[].eventId` (browser
DevTools Network, authenticated `/api/endpoint/dashboard` response) must match
`lastAcceptedUsage.eventId`. Do not share authentication headers or tokens.

Then lock the screen, wait, unlock and switch employee consoles if available.
Verify locked/inactive intervals do not add usage. Unknown must never create a
false unlock. This real-Mac privacy test is required before declaring resolution.

If needed, restart the existing service without enrollment:

```sh
"$orbit_root/app/runtime/node" "$orbit_root/app/src/macos-user-install.js" start
```

Return the `desktop-status` output plus whether the new dashboard usage entry
appeared (app, duration, timestamp, event ID). These diagnostics omit passwords,
enrollment tokens, Keychain secrets and browser titles. Native compilation,
installed LaunchAgent behavior and live dashboard collection remain unverified
until this Mac run is completed.
