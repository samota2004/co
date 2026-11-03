# Administrator notification lifecycle and verification

Assessment date: 2026-11-04. In-app notifications are persisted database records. They are not email.

## Automated verification evidence

Latest full backend run: `node --test --test-concurrency=1 server/test/*.test.js` — 135 tests, 133 passed, 0 failed, 2 skipped. The two skips are real DB-IP database lookups requiring the optional local database artifact. Relevant tests included `notification-lifecycle.test.js`, `endpoint-usb-alert.test.js`, and `admin-security-center.browser.test.js`. The browser case verified the authenticated admin bell/panel with a synthetic persisted fixture, the 60-second polling interval, refresh when the tab becomes visible, and read-state interaction. `notification-lifecycle.test.js` verified critical incident persistence/deduplication, recipient scoping, unread count, mark-read, mark-all-read, and employee denial.

This proves those covered flows in the configured test database/browser. It does not prove production tenant delivery or notification coverage for every enforcement transition.

## Implemented flow

1. The security pipeline creates a deduplicated `SecurityNotification` for qualifying HIGH/CRITICAL incidents and targets active security administrators in the company according to the incident recipient rule.
2. Endpoint USB connection observations can create a deduplicated admin alert scoped to the assigned admin/company. The message explicitly says a connection does not prove file access or data transfer; raw hardware identifiers are not included.
3. Authenticated admin APIs return a bounded page and unread count; marking one or all read is constrained to the authenticated recipient and company. Ordinary employees cannot use the admin routes.
4. SSE sends security notifications only to the matching recipient scope. The client de-duplicates by notification ID, updates the bell and panel, and supports read, read-all, incident navigation, and browser notifications when the administrator has separately granted browser permission.
5. A persisted fetch runs at login, when the tab becomes visible, and every 60 seconds while visible, so the admin can retrieve persisted alerts if SSE delivery is interrupted.

The notification panel has an empty state. A refresh error does not fabricate an alert; persisted records are fetched on the next refresh/poll. Notifications are currently fetched with a 50-record limit; API limit is capped at 100. This is not an external email delivery mechanism.

## Coverage and known gaps

| Event | Current status |
| --- | --- |
| High/critical security incident | Implemented with database persistence, recipient scoping, de-duplication and SSE. |
| USB connection | Implemented as a device-level observation; no transfer claim. |
| FREEZE/containment requested | Implemented for reviewed manual and eligible automatic requests; notification says OS confirmation is pending. |
| BLOCKED acknowledgement | Implemented only when all targeted Windows endpoints report `BLOCKED` and the backend marks the account `FROZEN`. |
| Failed or unsupported containment | Implemented from the authenticated endpoint acknowledgment; the notification identifies the safe result code and retains an unconfirmed state. |
| Restore request/result | Implemented for fresh-MFA Main Admin authorization and when all targeted endpoints report `ALLOWED`. |
| Authentication failure, trust change, prolonged offline, every policy violation | Not all are wired to notification generation. Do not infer coverage from the bell's presence. |
| External email/SMS | Not claimed; no delivery is verified by this flow. |

## Verification commands

From repository root:

```powershell
node --test --test-concurrency=1 server/test/notification-lifecycle.test.js server/test/endpoint-usb-alert.test.js server/test/admin-security-center.browser.test.js
```

The route/USB tests use the configured test database. The browser test additionally requires the repository's browser executable and browser-test dependencies; when skipped, it is not proof of rendered UI. The browser fixture inserts a clearly synthetic notification record and checks the authenticated admin bell/panel; it does not claim a production alert was observed. Real notification delivery should be demonstrated with an authorized test event in a non-production tenant and the matching admin account.

## Manual demo

1. Sign in as an authorized `SECURITY_ADMIN` or `SYSTEM_ADMIN` in a test tenant.
2. Generate a qualifying security incident through the existing authorized event workflow or use a test USB observation with a unique event ID.
3. On a dedicated Windows test endpoint, submit a reviewed containment request, then verify the distinct request, confirmed/failed/unsupported, restoration-request, and restoration-confirmed notification records as the endpoint acknowledges each valid state.
4. Confirm the scoped `SecurityNotification` row and recipient in the test database.
5. Confirm the bell unread count, panel title/severity/time, and incident navigation.
6. Mark it read; confirm the unread count decrements and remains read after page refresh.
7. Disconnect SSE in browser developer tools; wait for visible-tab polling or refresh; verify the persisted notification remains available.
8. Sign in as a standard employee and verify the notification API is denied.

Do not send synthetic simulator results into production telemetry or describe a browser toast as email delivery.
