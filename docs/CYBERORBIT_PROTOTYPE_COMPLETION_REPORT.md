# CYBERORBIT Prototype Completion and Verification

Assessment date: 2026-11-04. This report records repository evidence only. No physical Windows or macOS acceptance was performed in this run.

## Verdict

**Partially Ready** for a controlled prototype demonstration of the tested backend, browser, simulator, and agent workflows. Automatic containment now has a valid contextual-evidence eligibility path, but **production account containment and endpoint-native ML decisions are not ready** until physical endpoint acceptance and real labeled telemetry exist.

## Verification results

| Area | Command | Result |
| --- | --- | --- |
| Full backend | `node --test --test-concurrency=1 server/test/*.test.js` | 135 total; 133 passed, 0 failed, 2 skipped. Skips are optional real DB-IP local-database lookups. Includes API/database/browser tests. |
| Full agent | `node --test --test-concurrency=1 agent/test/*.test.js` | 140 total; 132 passed, 0 failed, 8 skipped. Skips: five macOS-native tests unavailable on Windows, one Unix storage-permission check unavailable on Windows, and two release ZIP checks because no fresh archives were supplied. |
| ML | `python -B -m unittest discover -s ml/test -v` | 29 passed, 0 failed. The synthetic pipeline tests validate plumbing only and do not report model quality. |
| Client build | `npm run build` | Passed after the full suites: Prisma generation and city preparation succeeded; Vite transformed 2,305 modules and completed in 10.37 seconds. Vite emitted a chunk-size advisory because the main JS bundle is about 1.17 MB before gzip. |
| JavaScript syntax | `node --check` on all modified agent/server JS modules and tests | Passed. |
| Diff integrity | `git diff --check` | Passed after final report edits; Git emitted only line-ending normalization advisories. |

The complete backend suite initially exposed two stale test assumptions/races. Tests were corrected to assert the current safe authorization contract and wait for the real refresh state. The final complete run then passed with the totals above. No production test assertion was weakened or removed.

## Admin notifications

Verified paths: qualifying critical assessment, containment request, confirmed `BLOCKED`, unsupported/failed containment, Main Admin restoration request, and confirmed `ALLOWED` all create persisted, deduplicated, recipient-scoped administrator notifications. List/unread/read state is recipient and tenant scoped; ordinary employee access is denied. The browser test verifies the admin bell/panel, 60-second polling, visibility-based refresh, and read-state interaction using a synthetic persisted fixture. USB connection observations create scoped alerts without claiming data transfer.

The containment notifications have backend workflow coverage, including persistence and duplicate acknowledgment protection. They still require a physical Windows endpoint demonstration of authenticated SSE delivery and native enforcement. In-app alerts are not email/SMS. See `docs/ADMIN_NOTIFICATION_VERIFICATION.md`.

## USB alert attribution and deduplication

### Investigation result

The configured local PostgreSQL database was queried read-only for an endpoint named `testing` and for persisted `USB device connection observed` notifications. It contained neither. No cleanup was performed because no record in this database was conclusively synthetic or misattributed. The reported records therefore came from a different backend database, tenant, or earlier database state; their original OS provenance cannot be established from this checkout.

The source review found two credibility problems that could produce misleading repeated alerts:

- USB notification generation considered every submitted event, including retry batches, rather than only newly accepted event rows.
- The notification text used the device's assigned employee name even though USB inventory is a device-level observation and is not employee-attributed telemetry.

### Implemented correction

- Endpoint ingestion now requires a valid enrolled credential and a non-deleted mapped employee/manager in the same tenant. A missing, revoked, unassigned, or invalid assignment fails with `ENDPOINT_ASSIGNMENT_INVALID`; endpoint display names are never used to resolve an employee.
- USB `EndpointEvent` rows remain `userId: null`. Bell records have `targetUserId: null`, and the text identifies an enrolled endpoint only. It does not assert a named employee, storage access, file access, or transfer.
- An event ID is acknowledged idempotently. The server creates USB notifications only for event IDs absent before the authenticated device transaction. A repeat observation of the same hardware remains quiet until an authenticated `USB_REMOVED` observation occurs; a later `USB_CONNECTED` then produces a distinct alert. The device-row transaction lock and per-recipient dedupe key protect concurrent delivery.
- USB connection remains distinct from Windows storage categorization. Windows classifies PnP/CIM inventory into storage, portable, optical, HID, keyboard, mouse, or other where available. macOS employee mode obtains `system_profiler` inventory and may not reliably determine storage class, so it remains a generic connection observation. Neither platform claims file access or transfer from connection alone.

Focused regression results: `server/test/endpoint-usb-alert.test.js`, `server/test/notification-lifecycle.test.js`, and `server/test/simulator-custom.test.js` passed **7/7**. Relevant agent collector/parser/policy tests passed **32/32**, with **1 expected Unix-only skip**. Native physical USB insertion/removal was not performed in this run.

The browser test now uses a persisted `ENDPOINT_USB_CONNECTED` record with the same device-level shape as ingestion and checks the notification bell/panel. Its execution was blocked in this environment by Chromium `spawn EPERM`; this is the same sandbox child-process restriction previously observed for worker/browser processes. The server/browser full suite must be rerun where browser spawning is permitted.

### Dedicated Windows USB acceptance procedure

1. Use a dedicated enrolled Windows test endpoint and a separate Main Admin account. Record the endpoint UUID and its mapped SID from the Devices page; verify the device name alone is never treated as an employee identity.
2. With no removable device inserted, start the agent and wait for its initial collector baseline. Confirm no `USB_CONNECTED` event or bell alert is generated from the baseline inventory.
3. Insert one harmless removable USB storage device once. Inspect the authenticated endpoint event list/database for a single `USB_CONNECTED` row with the enrolled endpoint UUID, `userId: null`, and a Windows category such as `USB_STORAGE` when CIM can classify it. Confirm one per-recipient bell record and that its text names only the endpoint.
4. Force a network retry while leaving that device inserted. Confirm the original event ID is acknowledged without a second event or notification. Restart or transiently interrupt the collector snapshot without removing media; confirm a second same-hardware observation is retained as device evidence but does not produce another bell alert.
5. Remove the device and confirm one `USB_REMOVED` observation. Insert it again; confirm a new `USB_CONNECTED` event and a new bell notification appear.
6. Insert a keyboard, mouse, or HID peripheral. Confirm Windows classifies it as a peripheral when the OS reports its class, and that the UI never claims removable storage, file access, or transfer merely from connection.
7. Try a mismatched device credential/device ID through the test harness only. Confirm the endpoint rejects it and creates no event or notification. Repeat with an unassigned/revoked device and confirm `ENDPOINT_ASSIGNMENT_INVALID`.
8. Repeat the observation tests on macOS only if using a supported Mac. Treat `system_profiler` inventory as generic connection evidence; do not claim storage classification or physical success without the recorded native output.

## Endpoint-native ML and CERT preservation

- The active CERT artifact and exact 21-feature user-day contract remain the only preserved production model. Artifact SHA-256 verified in the repository: `E41189B9093457BDF9561A2A7570A358787BD5C93C1C630FAFE9028459D1D9E4`.
- Live endpoint coverage for reconstructing the CERT input is 0/21 compatible features. Missing original CERT source/answer-key files prevent reproducing the saved training evaluation.
- No endpoint-native Random Forest was trained or promoted. Genuine representative endpoint telemetry and independently reviewed labels are absent. Synthetic smoke fixtures cannot enter production inference and produce no valid endpoint-model performance claim.
- The guarded CERT inference path rejects incomplete or incompatible input; missing values are not silently replaced with zero. Experimental research remains separate and synthetic test runs are not model evaluation.
- The deployed risk engine computes `max(ML threshold-mapped evidence, contextual evidence grouped by category)`. It does not implement the proposed 70/30 formula. Risk formula, threshold, model artifact, and feature contract were not changed in this verification work.

See `ml/research/ENDPOINT_ML_MODEL_REPORT.md` and `ml/research/ENDPOINT_FEATURE_COVERAGE.md` for the feature matrix, sources, and data/label readiness conditions.

## Containment, restoration, and simulator

- Automatic containment is explicitly opt-in. It requires a fresh authenticated protected-resource access, server-evaluated contextual evidence that itself reaches the configured freeze threshold, two independent non-history categories, current mapped Windows endpoint identity, and a Main Admin policy version. Unavailable or uncalibrated RF output is ineligible and cannot substitute for contextual evidence. This policy path has automated coverage but is **NOT production accepted** until physical Windows verification.
- Backend tests cover policy eligibility, signed/device/account/action-bound expiring commands, replay protection, Main Admin fresh-MFA restoration, and status changes only after endpoint acknowledgement. Workflow test success does not prove native account control.
- Server account/application restriction is distinct from local OS account disablement. Windows physical standard-user/admin tests have not been run. macOS employee LaunchAgent cannot enforce account-wide restriction; no managed root/MDM native component was validated.
- Simulator route and browser tests confirm bounded synthetic inputs and read-only behavior: it does not invoke ML inference, persist employee telemetry/risk/incidents, create enforcement commands, or change real OS accounts.

See `docs/ENDPOINT_CONTAINMENT_AND_RESTORATION.md` and `agent/docs/ACCOUNT-CONTAINMENT.md`.

## Native verification and blockers

1. **Windows:** perform the documented dedicated-machine standard-user and elevated-admin acceptance tests. Verify actual local account state, recovery-admin protection, service ACL, command expiry/replay, signed BLOCK/ALLOW acknowledgement, recovery, and audit history.
2. **macOS:** perform native install, launchd, telemetry, and permissions checks. Device-wide account enforcement requires an independently deployed administrator/MDM-managed component and must be tested as such; user-mode LaunchAgent does not provide it.
3. **Endpoint ML:** collect privacy-reviewed real endpoint data with identity, event IDs, UTC day closure, source coverage, and independently adjudicated ground-truth labels. Then pre-register leakage-safe user/time splits and evaluate in the isolated research pipeline before any separate promotion review.
4. **Notifications:** perform a physical Windows test that confirms the real admin receives persisted/SSE bell notifications for request, `BLOCKED`, failed/unsupported, restoration request, and `ALLOWED` states.
5. The two backend DB-IP tests require the optional local database artifact. They were skipped; city lookup behavior is not established by those tests.

## Prototype demonstration steps

1. Start the backend with a non-production PostgreSQL database and sign in as Main Admin with fresh MFA.
2. Open **Policies**, confirm automatic containment is initially off, then enable it. Confirm the policy audit entry is recorded.
3. Use a mapped, recently-heartbeating Windows fixture/device and an authenticated protected-resource access that has at least two contextual categories and reaches the configured threshold. Confirm the assessment reports `REQUESTED`, creates a signed device-bound `BLOCK`, and creates a containment-request bell record. Do not use simulator output or endpoint ML as input.
4. On the dedicated Windows test machine, allow the privileged endpoint component to report the signed `BLOCKED` result. Confirm all targeted endpoints have acknowledged before the UI/backend shows `FROZEN`; confirm the bell record and audit event.
5. Exercise expired/replayed/mismatched commands and unsupported helper results. Confirm the account remains unconfirmed/restricted, and the failure bell record is deduplicated.
6. Resolve the critical incident. As Main Admin with fresh MFA, authorize restoration and verify the pending `ALLOW` notification.
7. Confirm every targeted endpoint reports signed `ALLOWED` before backend state becomes `ACTIVE`; verify the restoration-complete notification and audit record.
8. Run a synthetic simulator scenario separately. Confirm it reports `simulationOnly`, writes no employee telemetry/risk/incident, issues no endpoint command, and changes no OS account.

## Relevant verification files

- `docs/ADMIN_NOTIFICATION_VERIFICATION.md`
- `docs/ENDPOINT_CONTAINMENT_AND_RESTORATION.md`
- `ml/research/ENDPOINT_ML_MODEL_REPORT.md`
- `ml/research/ENDPOINT_FEATURE_COVERAGE.md`
- `agent/docs/ACCOUNT-CONTAINMENT.md`
