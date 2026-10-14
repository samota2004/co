# CYBERORBIT employee macOS agent

For the single employee ZIP with double-click commands, transfer
`agent/dist/CYBERORBIT-macOS-Build-Kit.zip` to your Mac build account, extract it,
and double-click `Build-Mac-Install-Kit.command`. The verified Node runtimes are
included; Apple Command Line Tools are required on the builder only. This creates
`output/CYBERORBIT-macOS-Install-Kit.zip` inside the extracted build kit, containing
both architecture payloads. Employees extract that output ZIP and double-click
`Install-CYBERORBIT.command`. See the included short `README.txt` for the employee
flow. The Build Kit itself is for the builder and is not employee-installable.
The older per-architecture tar workflow below remains supported separately.

This is the user deployment, separate from the root LaunchDaemon in `UNIX.md`.
The repository implements this deployment; **macOS acceptance is pending**.
Development and tests for this change ran on Windows, not on a Mac. Do not
describe this release as production-certified until the Mac acceptance below
passes on both supported architectures. Source changes do not deploy the backend
to Render or update an installed agent.

## Build and distribute

On a logged-in Mac build account, install a compatible Node >=22 and Xcode
Command Line Tools through your normal software provisioning. Compile on each
target architecture: `arm64` for Apple Silicon; `x64` for Intel. Swift helpers
target macOS 13; the bundled Node runtime's own minimum OS requirement also
applies. Employees need neither Node nor development tools after packaging.

```sh
sh agent/packaging/build-unix.sh
# For a signed build, use your actual organization signing identity:
# CYBERORBIT_SIGNING_IDENTITY='your Developer ID Application identity' \
#   sh agent/packaging/build-unix.sh
```

The build includes the runtime, native helpers, companion extension folders,
installer and documentation in `agent/dist/CYBERORBIT-macos-arm64.tar.gz` or
`agent/dist/CYBERORBIT-macos-x64.tar.gz`, with a `.sha256` file and a build
manifest inside the archive. Existing output is refused; archive the old output
before another build. Native validation uses disposable Keychain test entries
and requires a logged-in build account. Each Mac build must pass its native tests.
Developer ID signing of helpers is supported. Signing/notarization of the complete
distribution and production extension publication remain release-owner tasks.
Unsigned development builds may require ordinary macOS approval. Do not disable
Gatekeeper, TCC, SIP or FileVault.

## Assign, install and enroll

1. Extract the matching archive in an employee-owned folder using the normal
   Archive Utility. Verify its SHA-256 against a checksum delivered through your
   trusted company distribution channel.
2. In Terminal, change into the extracted folder. Run:

   ```sh
   ./runtime/node ./src/macos-user-install.js identity
   ```

   Give the administrator the hostname and `identity` (`uid:NUMBER`). This command
   derives the current account, UID, home, hostname, OS version and architecture;
   it does not display credentials.
3. The administrator selects the employee in Devices, chooses macOS, sets that
   verified UID, assigns the device and issues an enrollment token. Give the
   employee the assigned **device UUID** and token through an approved channel.
   UIDs are local to a Mac; the device UUID and single-use token disambiguate the
   assignment. This is not hardware attestation: an administrator must verify the
   account/device relationship before issuing the token.
4. Run as the employee, without sudo:

   ```sh
   sh packaging/macos/install-user.sh
   ```

   Read the monitoring disclosure, type `MONITOR`, enter the assigned UUID, then
   paste the token into the hidden prompt. Allow normal Keychain access for the
   installed helper. The token is sent over HTTPS to
   `https://cyberorbit-backend.onrender.com/api/endpoint/enroll`; it is never placed
   in command arguments, configuration, logs or a plaintext file.
5. The installer checks the returned identity/device, stores credential and queue
   key in the employee Keychain, registers the Aqua LaunchAgent and waits up to
   45 seconds for a fresh authenticated heartbeat. After acknowledgment, close
   Terminal. Login starts the agent; logout ends it; unexpected exits restart
   after launchd's 30-second throttle. A native flock guards each user service.

An invalid/expired token can be retried before it is accepted. An identity mismatch
is rejected by the backend without consuming the token. If the token was accepted
but local storage or startup failed, preserve the installation and inspect the
dashboard; do not overwrite credentials or re-enroll blindly. Use the installed
`enroll` command only for an installation which has never successfully enrolled.
Use `start` after an enrollment whose heartbeat check timed out.

## Employee controls and diagnostics

Define this shell function in your current Terminal session; it uses the normal
home of the logged-in employee, without naming any account in source:

```sh
orbit() {
  "$HOME/Library/Application Support/CYBERORBIT/app/runtime/node" \
    "$HOME/Library/Application Support/CYBERORBIT/app/src/macos-user-install.js" "$@"
}
orbit status
orbit pause
orbit resume
orbit titles-off
orbit approve-directory "$HOME/Work/ApprovedProject"
orbit remove-directory "$HOME/Work/ApprovedProject"
```

Pause/resume and title/folder changes are saved locally and restart the agent
without requiring connectivity. Local pause overrides dashboard resume. Local
approval and dashboard approval must both permit every watched folder. Folder
approval is confined to specific employee-owned directories in the employee's
home, excludes agent storage, and rejects links and unsafe permissions. File
records contain names/change notifications, never file reads or contents.

```sh
launchctl print "gui/$(id -u)/com.cyberorbit.user-agent"
plutil -lint "$HOME/Library/LaunchAgents/com.cyberorbit.user-agent.plist"
tail -n 50 "$HOME/Library/Application Support/CYBERORBIT/logs/launchd.log"
orbit start
```

`status` shows launchd state and last locally recorded heartbeat acknowledgment;
an old timestamp is not proof of current connectivity. `start` verifies a fresh
acknowledgment. Logs rotate by truncation above 5 MiB. Local configuration, logs
and queue reside under `~/Library/Application Support/CYBERORBIT`; the generated
plist uses absolute, XML-escaped paths. Credentials remain in Keychain. A locked
or inaccessible Keychain causes startup failure, not plaintext fallback.

## Browser titles

Titles require **all** of: local `titles-on` consent, dashboard browser-title
setting, desktop monitoring enabled, Accessibility permission, and a fresh
non-private browser companion confirmation. Passwords, page contents, URLs,
cookies, history and input are not collected. The companion queries a title only
after an authenticated local service response confirms collection is enabled.
AX reads are matched against that normal-window title; unmatched/stale/private
observations are suppressed. Permission denial reports `permission-required`,
not successful empty collection.

```sh
orbit titles-on
orbit permissions
```

Use the ordinary macOS Accessibility prompt/settings to approve the installed
`app/native/macos-desktop` helper, then restart with `orbit start`. If macOS refuses
the permission for an unmanaged employee, request the company's normal permission
provisioning; the agent cannot bypass it.

Chrome, Edge, Brave and Chromium: install the packaged
`app/browser-companion/chromium` folder through that browser's ordinary extension
development UI for validation. Register the browser and its actual extension ID:

```sh
orbit browser chrome YOUR_ACTUAL_EXTENSION_ID
# Use edge, brave or chromium for those browsers.
```

Firefox: the packaged `app/browser-companion/firefox` is a WebExtension with ID
`cyberorbit-companion@cyberorbit.local`. Development validation can use
`about:debugging` > Load Temporary Add-on > its manifest. Temporary extensions
do not survive browser restarts; production requires a signed, published or
company-distributed Firefox add-on. Register it with:

```sh
orbit browser firefox cyberorbit-companion@cyberorbit.local
```

Keep private-window extension access disabled. Each browser's native host is
restricted to its registered extension ID and sends HMAC-authenticated IPC only
to this employee's service. The helper capability stays in a user-owned file
under the private data directory; backend credentials are never given to an
extension. Title matching supports plain titles and standard browser suffixes;
other localized/custom suffixes are suppressed. Bundles not in the supported
browser map report no title collection. **Safari application identification works,
but Safari titles report unsupported**, because no Safari private-window
confirmation extension is distributed here. AX alone is not sufficient to assert
that a Safari window is non-private.

Privacy references: [Apple Accessibility trust](https://developer.apple.com/documentation/applicationservices/1460720-axisprocesstrusted),
[Chrome window incognito/focus state](https://developer.chrome.com/docs/extensions/reference/api/windows),
[Firefox private browsing](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito).
macOS title metadata expires after seven days; the backend worker removes the title
field while preserving the audit event. Existing company/administrator scope
restricts dashboard access. Queued events retain stable IDs for server deduplication.

## Backend, dashboard and offline acceptance

Deploy the updated backend/frontend using your existing release process before
the Mac rollout; this task does not publish or enroll a real employee device.
The current application permits **administrator console login only**. Employee
attribution and service-layer employee views are preserved; this agent does not
change the console authentication policy to let employees log in.

With a fresh disposable device assignment and an authorized Mac tester:

1. Verify `orbit start` acknowledges a heartbeat; in Devices inspect employee,
   UUID, verified UID, version, CONNECTED, last heartbeat and collector health.
2. Open/switch applications; interact for at least 35 seconds. Check
   `APPLICATION_FOREGROUND` and `APPLICATION_USAGE` in the activity timeline.
3. Start/stop an employee-owned process lasting longer than the configured poll
   interval. Verify PID/owner/start time and `PROCESS_START`/`PROCESS_STOP`.
   Short-lived processes between polls can be missed.
4. With titles enabled in both places, Accessibility granted and companion
   installed, use distinctive public test titles in every supported browser.
   Switch tabs/applications; check their usage records. Deny Accessibility and
   repeat: permission health must be unavailable and new records must have no
   titles. Use distinctive private/incognito test titles: none may appear. Safari
   must explicitly report unsupported and produce no title metadata.
5. Test locked screen, unlock, sleep/wake and fast user switching. Inspect session
   records; a missing OS lock indicator must report degraded and must not invent
   unlock events. Foreground PID ownership must always match the enrolled UID.
6. Approve a specific folder locally and remotely, create/rename/delete fixtures,
   and verify `FILE_CHANGE` names. Verify unapproved/symlinked/other-owner paths
   do not produce employee activity.
7. Disconnect the network after enrollment. Check that local encrypted `.event`
   files accumulate; use no production-sensitive fixtures. Restart the service,
   reconnect, and verify queue drains and each event ID appears once in the
   dashboard/database. Queue limits: 50 MiB, 50,000 events, seven days. Overflow
   drops the oldest records and reports the count; no plaintext spool exists.
8. Close Terminal; log out/in; crash the disposable service and check launchd
   recovery and single-instance behavior. Final logout delivery is best effort;
   the final observed usage interval is queued during graceful shutdown.
9. Revoke the test device in the dashboard. At its next authenticated response the
   agent stops and writes a revocation marker; later logins do not resume it.
   Remote revocation cannot reach an offline device until reconnection. Verify
   user-mode account control, USB and device-wide network inspection report
   unsupported and never execute privileged commands.
10. Inspect AI Risk Analysis for the assigned employee. Compatible endpoint
   records feed the existing contextual analysis; the trained CERT model cannot
   infer from this partial dataset and remains explicitly unavailable. File
   changes are not file reads, and titles are not HTTP/email/content features.

## Uninstall

```sh
orbit uninstall
# Or, from the extracted distribution:
sh packaging/macos/uninstall-user.sh
```

After `UNINSTALL` confirmation, the agent boots out the current user's launchd
job, verifies the exclusive service lock, deletes its Keychain entry and matching
browser native-host manifests, and removes only its checked user installation.
It preserves server audit records. Revoke the device in the dashboard and remove
the browser extensions separately. The root deployment is never uninstalled by
this command. A second user install or a detected root installation is refused.

## Windows-to-macOS parity

| Existing Windows source behavior | macOS user behavior | Limitation / evidence |
|---|---|---|
| CIM process snapshots/start/stop | Own-UID `ps`, PID plus start-time diff | Polling misses brief processes; parser automated, native Mac pending |
| Foreground HWND/PID + app identity | NSWorkspace bundle/name/PID with UID check | Portable metadata tests; real NSWorkspace pending |
| Sampled application usage/switching | Same foreground/usage contract, 60-second idle exclusion | Bound helper gaps; Mac desktop acceptance pending |
| Recognized browser title with approvals | AX plus fresh normal-window companion proof | Chrome/Edge/Firefox/Brave/Chromium runtime pending; Safari titles unsupported |
| WTS session/login/logout | Own session snapshots and GUI notifications | Final logout is best effort; root sessions excluded |
| WTS lock/unlock | Available macOS session lock indicator | Missing indicator reports degraded; never invents unlock |
| Authenticated heartbeat | Same API + fresh local acknowledgment | Real HTTP/PostgreSQL test passed; actual installed Mac pending |
| Approved filesystem notifications | Both approvals, owned folders, no symlink recursion | No file-read detection; OS watcher limitations apply |
| DPAPI encrypted queue/retry/dedup | AES-256-GCM queue, key in user Keychain | Restart/replay/bounds automated; Keychain runtime pending |
| Service startup/watchdog | User Aqua LaunchAgent + helper watchdog + native flock | No sudo; actual login/logout/crash pending |
| Health + permission diagnostics | Same health contract, explicit unsupported/degraded status | Verified backend health storage and dashboard query |
| Windows account freezing, USB, device-wide TCP | Excluded in user mode | Unsupported; root deployment remains separate |
| Existing risk/audit ingestion | Same versioned event types, company/employee scope | Partial contextual analysis; no fabricated trained-model results |

## Source deliverables

User lifecycle: `src/macos-user.js`, `src/macos-user-install.js`,
`src/user-lock.js`, `src/user-revocation.js`, `src/user-desktop-supervisor.js`,
`src/service.js`, `src/enrollment.js`, `src/config.js`, `src/credential-store.js`.
Native integration/privacy: `native/keychain.swift`, `native/macos-desktop.swift`,
`native/macos-lock.swift`, `src/desktop-helper.js`, `src/ipc.js`,
`src/browser-privacy.js`, `src/browser-native-host.js`, `browser-companion/*`.
Collection/storage: `src/queue.js`, `src/collectors/{macos,index,files}.js`,
`src/account-control.js`, shared contract. Distribution: this guide, user install/
uninstall scripts, plist reference, `packaging/build-unix.sh`, package scripts.
Backend/UI: endpoint service, title retention worker/server registration,
`client/src/components/EndpointMonitor.jsx`. Tests: macOS user/runtime/contract
suites and updated existing integration fixture. Other pre-existing workspace
edits were preserved. See `MACOS-VERIFICATION.md` for the actual run results.
