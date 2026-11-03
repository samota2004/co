# CYBERORBIT macOS administrator and release guide

## Employee assignment and rollout

1. Build and validate `CYBERORBIT-macOS-Employee.zip` on a supported Mac using
   the reviewed source and the pinned runtime hashes.
2. Verify the ZIP hash through a trusted channel and retain its package
   manifest/checksum with the release record. Do not send enrollment tokens in
   the archive or a public channel.
3. Collect the employee's displayed `uid:<n>`, device UUID assignment and
   hostname through the approved provisioning process. Issue a one-use
   enrollment token for that exact employee/device assignment.
4. Employee runs the installer in their account, accepts the disclosure, and
   enters the assignment/token into the hidden terminal prompt. Verify the
   server's mapped identity and a fresh authenticated heartbeat.
5. Confirm permissions and collector health in Devices. Treat unavailable and
   unsupported states as such; do not infer missing telemetry.

## Main Admin uninstall review

Review the exact employee, device UUID, UID and `AGENT_UNINSTALL` action in the
authorization request view. Approve or reject with fresh Main Admin MFA and an
audit reason. Do not approve from a screenshot or an unrelated request. The
agent verifies its signed short-lived grant locally, consumes its nonce once,
stops the LaunchAgent, waits for process-lock release, then asks the backend to
complete and revoke. Backend outage or shutdown failure must leave the local
Keychain credential, binaries, queue and enrollment evidence untouched. After
revocation succeeds, local data stays for recovery/retention; handle deletion
through a separately approved data-retention process.

## Capability boundaries

- Darwin `SERVICE_STOP` is unsupported by the employee path. Main Admin remote
  monitoring pause/resume is supported through the existing authenticated
  `STOP_AGENT`/`START_AGENT` heartbeat commands with fresh MFA; it pauses
  collection without stopping launchd or revoking credentials. Do not represent
  service stop as a monitoring pause or a rejected request as success.
- The employee USB collector observes snapshots where macOS permits; it does
  not enforce the server USB policy. Employee network collection is limited to
  established TCP sockets visible to that account.
- The optional root LaunchDaemon is a separate local administrator/MDM package
  and lifecycle. Never install it from the employee ZIP. MDM deployment must
  define signing, ownership, least privilege, upgrade, recovery and uninstall
  authorization separately.
- The employee account owns its LaunchAgent and files. Main Admin authorization
  does not prevent that user or a local administrator from using direct OS tools.
- Accessibility is only needed for approved browser-title support. TCC grants
  must be made through normal System Settings or managed configuration. Do not
  bypass Gatekeeper, TCC, SIP or FileVault.

## Administrator/MDM-only deployment

The build handoff and employee ZIP contain only the user LaunchAgent path. They
exclude root LaunchDaemon plists and root installer scripts. The optional
system-wide deployment is documented separately in the source repository's
`agent/UNIX.md` and requires an administrator/MDM deployment plan. Do not copy
its plist into the employee package or run its installer as an employee. This
handoff provides no MDM profile or signed privileged helper.
For a separate managed root deployment, use the administrator-only procedures
in the source repository's `agent/UNIX.md`; this build handoff intentionally
does not ship those root installation scripts or plists. That root mode does
not inherit the employee LaunchAgent's Main Admin uninstall grant workflow.

## Evidence and incidents

Record package version/hash, macOS version, CPU architecture, employee UID,
device UUID, heartbeat/event/operation IDs, UTC timestamps, local log extracts
with secrets redacted, and dashboard/audit results. A source test or simulated
event is not native acceptance. Follow `../docs/MACOS-VERIFICATION.md` in the
repository for the complete disposable-device acceptance matrix.
