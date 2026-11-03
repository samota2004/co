# Automated endpoint account containment

## Status and boundaries

Automatic containment is disabled by default. Only an active Main Admin can enable it in **Policies → Automatic endpoint containment**. A request requires a fresh authenticated protected-resource access, a server-evaluated contextual score at or above the configured freeze threshold, and at least two distinct non-history evidence categories. The contextual evidence itself must reach the threshold; an unavailable, stale, or uncalibrated RF value cannot fill that role. Simulation, aggregate import, stale timestamps, missing/invalid contextual evidence, and endpoint ML output do not authorize containment. The feature targets recently connected enrolled Windows endpoints with a mapped local employee identity. Employee-mode macOS LaunchAgents and unverified platforms are reported as unsupported; they are not represented as contained.

A risk decision immediately restricts CYBERORBIT application access and revokes application sessions. The employee account is not labelled `FROZEN` until every targeted, non-revoked mapped Windows endpoint has returned a successful `BLOCKED` acknowledgment. Delivery, pending state, a session lock, or a failed/unsupported helper response is not proof of account disablement.

## Authorization and command lifecycle

The backend creates a short-lived BLOCK/ALLOW command in the existing endpoint enforcement command store. The command ID is its one-time nonce. Commands are HMAC signed with the enrolled device credential and bind the action, device ID, mapped OS identity, issue time, and expiry. The agent validates the signature, binding, clock window, and expiry before calling its privileged OS account-control helper. It persists handled command IDs and results to prevent a retry from repeating the OS action. The authenticated heartbeat reports the result; the backend changes account status only after a matching unexpired command and a valid result code are acknowledged.

Restoration uses the existing `/api/users/:id/unfreeze` action. It requires an active Main Admin, fresh MFA (15-minute maximum), review notes, and resolved critical incidents. It issues signed, device-bound, 120-second ALLOW commands to devices with confirmed containment. The account remains restricted until all affected endpoints confirm `ALLOWED`. A stale or offline command expires; an administrator must review and issue a fresh restoration action.

The Windows helper protects the separately mapped recovery administrator and rejects unsafe employee/admin identity mappings. Windows production behavior still requires physical testing of the service, actual account state, and recovery path. A local administrator or SYSTEM operator can ultimately control/tamper with endpoint software.

## macOS boundary

The employee LaunchAgent runs as the logged-in employee and cannot disable that account or provide device-wide protection from its owner. The employee package does not gain root authority. Root LaunchDaemon deployment is a separate administrator/MDM-managed architecture and is not enabled by this feature. macOS devices therefore receive an explicit unsupported outcome for account containment; no synthetic success is returned.

## Windows acceptance checklist

Use a disposable, enrolled Windows test machine and a standard employee account. Preserve a separate verified local recovery administrator and at least one other administrator. Never target an administrator account.

1. In Main Admin Policies, confirm automatic containment is off. Confirm a critical simulated assessment does not change the OS account or show `FROZEN`.
2. Enable automatic containment as Main Admin and record the policy audit event. Confirm a non-Main-Admin cannot enable it.
3. Verify the enrolled device is Windows, online, mapped to the employee SID, and the local account-control configuration has `enabled=true` and a different verified recovery-admin SID.
4. Confirm the assessment is a fresh authenticated resource access and that the contextual evidence, independent category count, timestamp, enrolled Windows device, and mapped local identity all meet policy. Confirm unavailable or uncalibrated RF output cannot satisfy any of those gates.
5. For OS command acceptance, use the dedicated test account. Inspect the risk or audit record score, contextual evidence, timestamp, evidence categories, source, and policy decision.
6. Confirm application sessions are revoked and account status is restricted while the OS command is pending. Inspect command history; it must show a short-lived BLOCK command and no SUCCEEDED state before the agent report.
7. Observe the Windows local account/session state through Windows administration tools. Confirm the mapped employee is disabled/logged off and the recovery administrator remains enabled. Then confirm backend status becomes `FROZEN` only after the matching `BLOCKED` acknowledgment.
8. Repeat with a stale event, simulation, one evidence category, missing mapped identity, unsupported platform, disabled local control, and an offline endpoint. Each must avoid a successful containment claim.
9. Try replaying the same signed command and a command with changed action/device/identity/expiry. The agent must not repeat an OS action or accept a modified command.
10. Leave a critical incident unresolved and attempt restoration. It must be rejected. Resolve/review it, then attempt restoration without fresh MFA and as a non-Main-Admin; both must be rejected.
11. As Main Admin, complete fresh MFA and submit reviewed restoration notes. Confirm a signed ALLOW command appears with a short expiry. Observe the actual Windows local account re-enabled; backend status must remain restricted until the endpoint reports `ALLOWED`.
12. Replay the ALLOW command; verify no second OS change. Test a dropped heartbeat, expired command, helper failure, and agent restart. No unconfirmed success is allowed; issue a new reviewed command after expiry.
13. Verify audit history includes containment requested/confirmed and restoration authorized/confirmed, with actor, target, command ID, and result. Verify command reports do not contain credentials or authorization secrets.

**Pass criteria:** actual OS state matches every success status; recovery admin remains enabled; all unauthorized, stale, mismatched, replayed, offline, or unsupported cases fail closed. Save command output, Windows account state, service logs, backend audit records, and screenshots for each case. Automated tests use mocked native helpers and are not Windows acceptance evidence.

## macOS acceptance checklist

1. Enroll an employee-mode LaunchAgent device and verify its OS platform and mapped UID.
2. With the Main Admin policy disabled and enabled, verify that macOS is surfaced as unsupported for account disablement. It must not report `BLOCKED`, `FROZEN`, or successful OS containment.
3. Verify a risk incident, application session revocation, and endpoint command/error status are visible and correctly attributed.
4. Verify no LaunchDaemon is installed by the employee package and no privilege prompt/password capture is introduced.
5. If a separate administrator/MDM LaunchDaemon prototype is deployed for evaluation, test it only under an administrator-approved deployment plan; confirm the employee agent alone cannot claim or perform privileged account changes.

**Pass criteria:** unsupported employee-mode actions remain unsupported and all risk/audit evidence is accurate. Physical Mac testing is required to validate launchd process mode and any separate privileged package.

## Recovery

If backend approval is unavailable, the agent fails closed and retains the account-control outcome for the next authenticated heartbeat while command validity remains. Expired commands are not replayed. The Main Admin must review the incident and issue a fresh restoration command after MFA. If local recovery is required because the endpoint agent/helper is damaged, an authorized IT administrator uses the organization’s documented Windows/macOS account recovery procedure outside CYBERORBIT, records the action in the incident, and verifies the actual account state before restoring CYBERORBIT access. Do not disable or remove the only recovery administrator.


