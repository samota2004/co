# Linux and macOS agent 1.1.0

Source implementation is available. It has not yet passed acceptance on a real
Linux or macOS machine. Build on the target OS/CPU; do not install Windows binaries
on Unix. Keep two accounts: a standard employee account and a tested recovery
administrator. Windows installations are not modified by these instructions.
Deploy the matching reviewed backend/frontend source before using the new agent
metadata; older APIs reject Linux/macOS identity-source fields. Source edits here
do not deploy to Render or update already installed agents automatically.

## Supported collection

| Feature | Linux | macOS |
|---|---|---|
| Enrollment, authenticated upload, encrypted offline queue | Existing shared pipeline; new credentials encrypted by systemd-creds host key | Existing shared pipeline; root System keychain |
| Running/start/stop processes, USB, approved file changes, optional TCP metadata | Existing system collectors | Existing system collectors |
| Foreground app identity and sampled duration | X11; GNOME Shell 45+ extension on Wayland; Plasma 6 KWin integration on Wayland | NSWorkspace name, bundle ID and PID |
| Active browser window title | Opt-in, from supported desktop integration | Opt-in, Accessibility permission required |
| Sessions and lock/idle exclusion | loginctl plus desktop/compositor signals | who session snapshots plus GUI session/lock state and idle API |
| Boot startup/recovery | Root systemd service supervises mapped user helper | Root LaunchDaemon supervises mapped user LaunchAgent |
| Freeze/unfreeze | Opt-in standard local account, sudo recovery admin, PAM/loginctl | Opt-in standard local account without SecureToken/FileVault/mobile identity |

Application recognition is generic, not a list limited to Chrome/Calculator.
Applications that withhold an OS identity/title cannot be identified more precisely.
Browser titles are not URL history, messages, page contents, calls or transferred files.
Background records show observed processes; they do not prove active use or measure
exact background duration. Sampling can miss applications opened and closed between polls.
Other Wayland compositors currently report unavailable. Do not disable Wayland security
or GNOME's sandbox to expose foreground windows. GNOME's extension uses the supported
[Meta.Window APIs](https://gnome.pages.gitlab.gnome.org/mutter/meta/class.Window.html);
Plasma uses the [KWin scripting API](https://develop.kde.org/docs/plasma/kwin/api/).

KDE's Wayland idle integration listens for idle/resume events; polling `idleTime()`
returns no usable idle time on this backend ([KDE implementation](https://github.com/KDE/kidletime/blob/master/src/plugins/wayland/poller.cpp)).
Until a real idle/resume signal arrives, usage is excluded. The helper reports the
60-second eligibility threshold, not an exact millisecond idle measurement.

## Build

Requirements: Node >=22 on the target architecture. macOS needs Xcode Command Line
Tools (`swiftc`). Linux needs systemd >=250 with `systemd-creds`, logind, util-linux
`setpriv`, Python 3 with PyGObject/Gio. X11 needs `xprop` and `xprintidle`. Plasma
Wayland builds need CMake, Qt 6 development files/Wayland runtime and KF6 IdleTime
development/runtime libraries. These dependencies are checked or reported unavailable;
the installer does not download packages.

From the repository root on Linux/macOS:

```sh
# Linux X11/GNOME or macOS:
sh agent/packaging/build-unix.sh
# Linux Plasma Wayland (also includes X11/GNOME support):
CYBERORBIT_KDE=1 sh agent/packaging/build-unix.sh
```

Choose one build command. Existing output is refused rather than overwritten.
The runtime-inclusive archive is `agent/dist/CYBERORBIT-linux.tar.gz` or
`agent/dist/CYBERORBIT-darwin.tar.gz`. Use a stable Developer ID signing identity
via `CYBERORBIT_SIGNING_IDENTITY` when distributing macOS builds. Unsigned/local
builds need explicit approval; rebuilds may invalidate Accessibility/keychain trust.
Do not disable Gatekeeper or relax global execution/security policy.

## New Linux installation

On the employee laptop, verify the local account's numeric UID using `id -u employee`.
Assign the Linux device in Devices using `uid:NUMBER`, then issue its enrollment
token. Replace `employee` and the HTTPS origin below with the real values. These
steps configure monitoring; they do not create OS accounts or set passwords.

```sh
sudo install -d -m 755 /opt/cyberorbit
sudo tar --no-same-owner -xzf CYBERORBIT-linux.tar.gz -C /opt/cyberorbit
sudo /opt/cyberorbit/runtime/node /opt/cyberorbit/src/configure-unix.js \
  --server https://cyberorbit-backend.onrender.com --employee employee
```

For opt-in browser titles, add `--browser-titles` to configuration and enable the
device's browser-title setting in the dashboard. Both approvals are required.

Run the token step in **Bash**, with shell tracing disabled. The entered token is
not a command argument, shell-history entry or exported environment variable:

```bash
set +x
sudo -v
IFS= read -r -s -p 'Enrollment token: ' orbit_token
printf '\n'
printf '%s' "$orbit_token" | sudo /opt/cyberorbit/runtime/node \
  /opt/cyberorbit/src/cli.js enroll /etc/cyberorbit/config.json
unset orbit_token
sudo sh /opt/cyberorbit/packaging/linux/install.sh
```

For GNOME Wayland, log out/in after installation, then in the employee's session:
`gnome-extensions enable desktop@cyberorbit.local`. Unsupported Shell versions or
disabled extensions produce unavailable foreground health; they do not stop the
system collectors. KDE requires the package built with `CYBERORBIT_KDE=1`.
The service launches the helper only in the mapped user's active graphical session.

## New macOS installation

Verify `id -u employee`, assign a macOS device with `uid:NUMBER`, and issue a token.

```sh
sudo install -d -m 755 /Library/CYBERORBIT
sudo tar --no-same-owner -xzf CYBERORBIT-darwin.tar.gz -C /Library/CYBERORBIT
sudo /Library/CYBERORBIT/runtime/node /Library/CYBERORBIT/src/configure-unix.js \
  --server https://cyberorbit-backend.onrender.com --employee employee
```

In Bash, repeat the hidden token procedure above using:

```bash
set +x
sudo -v
IFS= read -r -s -p 'Enrollment token: ' orbit_token
printf '\n'
printf '%s' "$orbit_token" | sudo /Library/CYBERORBIT/runtime/node \
  /Library/CYBERORBIT/src/cli.js enroll /Library/CYBERORBIT/config.json
unset orbit_token
sudo sh /Library/CYBERORBIT/packaging/macos/install.sh
```

Add `--browser-titles` and enable browser titles in Devices if required. In System
Settings > Privacy & Security > Accessibility, approve
`/Library/CYBERORBIT/native/macos-desktop`. File monitoring of protected directories
may additionally require Full Disk Access for the service runtime. The collector
reports permission failures rather than inventing records. The helper runs in the
mapped user's GUI session and the root service remains available after logout.

## Existing enrolled installations

Back up the **code** before updating. Stop only the CYBERORBIT service, replace the
reviewed package code as root, preserve its config and data, then run
`configure-unix.js --employee employee` and the installer. Never re-enroll an
already enrolled device. The configurator verifies the existing mapped UID and
recreates only the helper capability in a separate traversable directory. Credential
and queue directories remain root-only. The new sibling capability fixes the old
0700-parent traversal problem without granting access to device credentials.

Use `--migrate-credentials` only with the old credential store accessible under the
same root service identity. It copies the same keys into Linux host encryption or
the macOS System keychain; it does not rotate enrollment or rewrite queued records.
If the old keyring cannot be opened, migration fails and its original data stays.
Do not purge the queue, weaken keyring permissions, or silently create new keys.
Keep Linux's `/var/lib/systemd/credential.secret` protected; it is necessary to
decrypt the host-encrypted credential after reboot. The queue and encrypted blob
alone are not a portable backup to another machine.

## Optional account freeze enforcement

First log into the separate recovery administrator and verify it can administer
the machine. The employee must be a local standard account. Enable locally:

```sh
# Linux; use /Library/CYBERORBIT paths for macOS:
sudo /opt/cyberorbit/runtime/node /opt/cyberorbit/src/configure-unix.js \
  --employee employee --recovery-admin recoveryadmin --recovery-login-verified
sudo sh /opt/cyberorbit/packaging/linux/install.sh
```

On Linux, this also permits the root service to modify `/etc` in its systemd
sandbox, because usermod creates passwd/shadow lock and replacement files there.
Without local approval, the sandbox remains read-only outside the queue directory.
Only fresh authenticated heartbeat instructions for the enrolled UID are applied.
The backend's existing administrator scope and main-admin rules remain unchanged.

Linux locks the password and expires the account, then terminates its user sessions.
macOS uses local per-user disable/enable policy and terminates that user's sessions.
Recovery administrators, system UIDs, network/mobile accounts, already externally
disabled accounts and unsupported macOS SecureToken/FileVault employee accounts are
refused. Existing sessions may lose unsaved work when an administrator freezes them.
Linux support requires login/PAM services that honor account expiry; arbitrary
custom login services are not guaranteed. FileVault preboot unlock requires MDM/
enterprise recovery controls and is not implemented by this agent.

Unfreeze restores only an agent-owned disable whose protected journal still matches.
A partial change, changed password/policy or altered journal reports
`RECOVERY_REQUIRED`. Do not delete the journal to force an automatic enable. Use
the recovery administrator's OS tools to inspect/restore the account and review
the journal. `LOGOFF_PENDING` is not a verified sign-out. New remote actions require
connectivity; a previously applied disable persists across reboot. Restore access
before revoking/uninstalling an agent on which remote recovery depends.

## Administrator controls and acceptance

Linux: `sudo systemctl stop cyberorbit`; `sudo systemctl start cyberorbit`;
`sudo systemctl disable --now cyberorbit` to disable boot startup.
macOS: `sudo launchctl bootout system /Library/LaunchDaemons/com.cyberorbit.agent.plist`
stops it; `sudo launchctl disable system/com.cyberorbit.agent` disables boot startup;
rerun the installer to enable/start it. The dashboard's authorized Pause collectors
continues health/configuration without collecting observations.

Terminal closure does not stop these system services. They resume after reboot and
restart after abnormal failure. They cannot collect while powered off. Users must
be standard accounts: a local root/admin can always stop or alter local software.
A user can still disrupt their own desktop integration/permissions, or forge their
own signed helper observations; supervision is recovery, not tamper-proof evidence.

On **each target OS**, record before/after evidence:

1. Service remains alive for at least five minutes, heartbeats advance, queue drains.
2. Use two arbitrary apps and a browser for >35 seconds; verify correct names,
   UID/device/employee, title opt-in and latest timestamps in Devices.
3. Lock/unlock and idle >60 seconds; excluded intervals are not counted.
4. Close the terminal, kill only the user helper, log out/in and reboot; verify
   recovery and newly stored activity (not merely a brief Running state).
5. On a disposable machine, freeze only the standard employee: session terminates,
   login is rejected, recovery admin can log in, unfreeze restores employee login.
6. Check offline retention, stale command refusal, disabled permissions, unsupported
   compositor behavior and unchanged administrator visibility boundaries.

Inspect `systemctl status cyberorbit`/`journalctl -u cyberorbit` on Linux or
`launchctl print system/com.cyberorbit.agent` and `/var/log/cyberorbit.log` on macOS.
Never paste credentials, helper grants, password hashes or tokens into diagnostics.
