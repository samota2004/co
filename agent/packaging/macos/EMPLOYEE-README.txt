CYBERORBIT macOS Employee Install Kit

This folder supports Apple Silicon and Intel Macs running macOS 13 or later.
Your administrator must validate the kit on supported Macs before rollout.
No Node installation, Xcode, sudo, or source editing is needed by employees.

INSTALL
1. Extract the complete ZIP in a folder you own. Keep the entire folder together.
2. Double-click Show-Employee-Identity.command. Give your administrator the shown
   username, identity (uid:number), and hostname. No fixed employee is configured.
3. The administrator assigns this Mac to you in CYBERORBIT Devices with that UID,
   issues a single-use enrollment token, and gives you its assigned device UUID.
4. Double-click Install-CYBERORBIT.command from your own account, without sudo.
   Read the disclosure, type MONITOR, enter the assigned device UUID, then paste
   the enrollment token at "Enrollment token (hidden)" and press Return.
   The token is never echoed, saved in a file, or passed as a command argument.
5. Approve ordinary macOS login Keychain access for the installed CYBERORBIT
   helper if requested. The installer waits for an authenticated heartbeat.
6. After acknowledgment, close Terminal. A user LaunchAgent starts the agent at
   login, runs it in the background, and restarts it after unexpected crashes.

If macOS blocks a trusted company kit, use its ordinary Open/Privacy & Security
approval process or ask IT for a signed/notarized release. Do not disable OS
protections. Full Disk Access, screen recording, input monitoring and admin
credentials are not requested for the standard application/process collectors.

CHECK CONNECTION
Double-click Check-CYBERORBIT.command. It shows the launchd job and the last local
authenticated heartbeat acknowledgment. An old acknowledgment is not a fresh
connection test. The administrator checks Devices for your employee, device UUID,
mapped UID, CONNECTED status, current last heartbeat, version and collector health.
Normal successful heartbeats arrive about every 30 seconds. Reopen the installer
to start/verify an existing enrollment without consuming another token.
Offline monitoring continues after enrollment; encrypted queued records replay
automatically on reconnect, subject to size and seven-day retention limits.

OPTIONAL BROWSER TITLES
Application usage and process monitoring do not require Accessibility.
Browser-title functionality is implemented but has NOT been verified on real Mac
browsers. Safari titles are unsupported and must remain unavailable.
For testing Chrome, Edge, Brave, Chromium or Firefox, you need all of:
- Explicit employee consent: Enable-Browser-Titles.command (type TITLES).
- Administrator enables browser titles for this device in the dashboard.
- Ordinary macOS Accessibility approval for the installed helper at:
  ~/Library/Application Support/CYBERORBIT/app/native/macos-desktop
- A registered, approved non-private browser companion. See the detailed guide
  in payloads/arm64/packaging/macos/USER-INSTALL.md (same on Intel).
The title command prompts macOS normally; it does not bypass permissions.
Missing permission/proof must report unavailable. Private-window extension access
must remain disabled. No page contents, keystrokes, URLs or cookies are collected.
Firefox temporary add-ons do not survive browser restarts; production requires
a signed or company-distributed add-on. Titles stay off by default.

PAUSE OR UNINSTALL
Double-click Uninstall-CYBERORBIT.command and type UNINSTALL to confirm. It stops
this user's job and removes only this installation, its queue and its Keychain
credential. Ask the administrator to revoke the device and remove browser add-ons.
Server audit records and other deployment modes are preserved.
Local pause/resume commands are documented in the detailed USER-INSTALL.md guide.

PROBLEMS
If enrollment was accepted but startup failed, preserve the installation and ask
the administrator to inspect the assignment; do not delete data or request a new
token blindly. Reopening the installer preserves existing credentials/queue.
A revoked device will not silently re-enroll. Logs are in your own account:
~/Library/Application Support/CYBERORBIT/logs/launchd.log
Initial enrollment and remote connection verification require internet access.
User mode cannot freeze OS accounts or monitor other employees' sessions.
