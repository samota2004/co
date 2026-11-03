# Endpoint account containment and restoration

Assessment date: 2026-11-04. This describes application access restriction separately from confirmed local operating-system enforcement.

## Automated verification evidence and readiness

The latest full backend run completed with 135 tests: 133 passed, 0 failed, 2 skipped (optional DB-IP local-database lookups). Relevant coverage includes `containment-policy.test.js`, `security-auto-freeze.test.js`, `account-restriction-workflow.test.js`, `authorization-integration.test.js`, `risk-authorization.test.js`, `admin-only-login.test.js`, and simulator API/browser cases. The agent suite completed with 140 tests: 132 passed, 0 failed, 8 skipped. Agent skips include native macOS checks, one Unix file-permission check, and Windows/macOS release archive validation because no release archive was supplied. These are code/test results, not physical OS acceptance.

Automatic containment remains **NOT READY**: the active risk engine does not provide the calibrated confidence required by the explicit policy gate, so automatic command issuance fails closed. No actual Windows account was contained/restored in a physical acceptance run. macOS user-mode account enforcement is unsupported; no administrator-managed native component was verified. Application-level restriction and backend workflow tests must not be described as OS enforcement.

## Current workflow

- Automatic containment defaults OFF. Enabling the policy is restricted to the Main Admin and audited.
- A genuine contextual assessment can restrict the CYBERORBIT account/session and create a security incident. Protected application sessions are revoked. This is application-level access control.
- The server creates a device/user/action-bound enforcement command for eligible mapped Windows endpoints. Commands have short expiry and are delivered only over the authenticated enrolled-device heartbeat. The endpoint validates device/account identity, HMAC signature, expiry, allowed action and durable replay state before invoking the native account helper.
- The native account helper protects a separately configured and verified recovery administrator and refuses unsafe/mismatched account changes. Results are persisted locally and reported on authenticated heartbeat. Backend status is updated to FROZEN only after the expected BLOCKED acknowledgement for all targeted devices. A queued or delivered command is not success.
- Restoration route is Main Admin-only, requires fresh MFA (maximum age 15 minutes), review notes, a reviewed/resolved critical incident, and a mapped employee. The backend issues ALLOW; user status is not marked restored until the endpoint confirms ALLOWED. Offline devices remain pending.
- Employee LaunchAgent mode is explicitly unable to change local OS accounts. Optional Unix/root account control requires privileged deployment and preflight; it is not included as an enabled employee-mode capability. macOS device-wide enforcement is unsupported unless a separately administrator-managed privileged deployment is installed and verified.

## Automatic containment eligibility

The policy no longer asks the risk engine for a confidence value it does not have. It requires a fresh authenticated protected-resource access, explicit Main Admin opt-in, at least two independent non-history categories, a current mapped Windows endpoint, and contextual evidence at or above the configured freeze threshold. The contextual evidence itself must meet that threshold. An unavailable endpoint ML assessment, an uncalibrated CERT RF score, a model-only score, synthetic data, aggregate import, stale evidence, or an unmapped/offline endpoint cannot issue a BLOCK command.

This is still safety-gated rather than production-accepted: the assessment inputs and Windows command execution require dedicated physical acceptance. Manual reviewed containment remains a separate administrative path.

The policy threshold and risk formula are unchanged. The actual code computes `max(ML threshold-mapped evidence, contextual evidence)`, not a 70/30 weighted sum. Missing endpoint ML inference cannot trigger containment.

## Privilege and recovery boundaries

- Windows: local account control requires the installed privileged service mode and explicit configured employee SID plus separate verified recovery-admin SID. Standard-user vs elevated-admin behavior, actual OS state, service ACL and recovery require tests on a dedicated real Windows machine. A fully privileged local administrator/SYSTEM can tamper with endpoint software.
- macOS/Linux: user-mode agent reports unsupported for account changes. Privileged root deployment must be separately installed and managed; the employee ZIP must not imply account disablement. Physical macOS and admin/MDM validation are outstanding.
- Neither platform collects administrator passwords. If the helper refuses or reports `LOGOFF_PENDING`, `ACCESS_DENIED`, `UNSAFE_ACCOUNT`, `UNSAFE_RECOVERY`, `UNSUPPORTED_MACHINE`, or `NATIVE_ERROR`, backend must retain a pending/failed state rather than claim containment.
- Emergency recovery requires the separately verified recovery administrator and an authorized Main Admin restoration flow. Retain local command state and audit history while investigating partial failure.

## Demonstration steps

1. Use a disposable, non-production tenant and dedicated Windows test device with an ordinary mapped employee account and a distinct, tested recovery administrator.
2. Confirm automatic containment is disabled. Demonstrate simulator scenarios first; simulator runs are explicitly synthetic, call no ML inference, do not persist employee activity/risk/incidents, and issue no OS commands.
3. Demonstrate a real authorized contextual event without enabling automatic control; inspect risk explanation, incident, admin notification and session revocation.
4. For manual endpoint enforcement only, enable/configure the reviewed account-control prerequisites and use the supported admin command workflow. Capture command ID/status and native helper result.
5. Confirm the local account state through native OS tools and backend acknowledgment before claiming FROZEN.
6. Resolve the critical incident, authenticate as Main Admin with fresh MFA, submit review notes and issue restoration. Confirm native ALLOWED result and backend acknowledgment before claiming RESTORED.
7. Repeat offline, expired-command, replay, unsafe-recovery-account and partial-failure cases in the isolated test environment.

No physical Windows or macOS acceptance was performed in this environment.
