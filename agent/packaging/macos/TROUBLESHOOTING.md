# CYBERORBIT macOS employee troubleshooting

Use the employee account and do not run these commands with `sudo`. Do not
delete the support directory to “repair” an installation; it contains the
encrypted offline queue and enrollment evidence.

## Check installation and heartbeat

Double-click `Check-CYBERORBIT.command`. In Terminal, the equivalent is:

```sh
launchctl print "gui/$(id -u)/com.cyberorbit.user-agent"
```

Logs are at `~/Library/Application Support/CYBERORBIT/logs/launchd.log`.
`Diagnose-Application-Usage.command` reports the local collection pipeline;
confirm its event ID separately in the dashboard. A fresh heartbeat proves
agent communication, not that an application event was collected.

## Common recovery

- **No heartbeat:** confirm network access, assigned device UUID and mapped UID
  with IT. Run `Update-CYBERORBIT.command` only with the reviewed employee ZIP.
  Preserve the local data directory and do not re-enroll over existing data.
- **Keychain prompt/error:** approve the expected CYBERORBIT helper through the
  normal macOS dialog. Never paste a Mac login/admin password into CYBERORBIT.
  IT may need to restore the signed helper through normal device management.
- **No foreground or usage events:** be logged in to the Aqua desktop session;
  check `Diagnose-Application-Usage.command`, helper status and local/dashboard
  active-application settings. Unknown lock/idle state is not converted into
  active usage.
- **No browser titles:** title collection is optional. Require local consent,
  dashboard approval, a supported browser companion, Accessibility approval,
  and a focused normal window. Private windows and Safari titles are excluded.
- **No network events:** employee mode reports only established TCP sockets
  visible to the account, and only when the network collector is enabled.
  Interface changes and device-wide traffic are not represented by this event.
- **USB observation unavailable:** check local `usb` collector health and
  whether `system_profiler SPUSBDataType -json` runs on the target macOS. This
  feature observes inventory only; it does not block devices or confirm transfer.
- **Uninstall is pending:** keep the agent and employee kit. A Main Admin must
  review the exact device/action with fresh MFA while the Mac is online. Do not
  manually remove the LaunchAgent or credential.
- **Uninstall failed before revocation:** local credentials and files remain;
  use `orbit start`/`Check-CYBERORBIT.command` as instructed by IT, then request
  a new authorization if the old grant expired.
- **Uninstall failed after confirmed revocation:** preserve all files and rerun
  `Uninstall-CYBERORBIT.command` from the same employee kit to resume cleanup.
  The encrypted queue, marker, config and logs remain by design.
- **Update failed:** preserve `app`, `app.previous-*`, `app.failed-*`, config,
  queue and logs. The updater attempts to restore the previous app and reports
  if launchd recovery also fails. Give the exact error and log to IT; do not
  delete either app tree or request a new enrollment token.

The employee LaunchAgent is owned by the employee account. A user or local
administrator can control it directly using macOS tools. Main Admin approval
governs supported CYBERORBIT operations; it is not OS-level anti-tamper against
the account owner or a privileged administrator.
