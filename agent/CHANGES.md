# Files changed for endpoint monitoring

## 1.1.0 Linux/macOS source implementation

- Shared application identity/browser recognition now accepts Linux desktop IDs and macOS bundle IDs; backend heartbeat account instructions support all three platforms without changing RBAC or schema.
- Linux foreground helper supports X11 and GNOME/KDE Wayland integration. KDE uses idle/resume events, not unsupported idle polling.
- macOS adds browser-title Accessibility checks, app bundle identity, session/lock sampling, and session snapshots.
- Root services supervise mapped-user helpers. Installers verify root ownership/enrollment, preserve queue/configuration, and require native dependencies. See UNIX.md.
- Linux credentials use host encryption; macOS uses System keychain. Existing stores remain readable for explicit migration.
- Locally approved standard-account freeze/unfreeze uses a protected ownership journal and separate recovery administrator checks. External disables and partial changes require review.
- Native OS acceptance remains pending; no installed agent or production deployment is updated by source edits.


Pre-existing frontend, backend and schema edits were preserved. The existing `EndpointDevice`/`EndpointEvent` models and `20261007090000_endpoint_agent` migration are reused and the additive migrations were deployed to the configured local PostgreSQL database.

## New agent files

- `agent/package.json`
- `agent/shared/contract.js` — versioned wire/config/health validation shared with backend
- `agent/src/enrollment.js`, `credential-store.js`, `config.js`, `normalizer.js`
- `agent/src/queue.js`, `uploader.js`, `health.js`, `service.js`, `ipc.js`, `desktop-helper.js`, `cli.js`, `native.js`
- `agent/src/collectors/index.js`, `windows.js`, `linux.js`, `macos.js`, `files.js`
- `agent/native/windows-api.cs`, `windows-snapshot.ps1`, `windows-desktop.ps1`, `vault.ps1`, `keychain.swift`, `macos-desktop.swift`
- `agent/packaging/windows/ServiceHost.cs`, `build.ps1`, `install.ps1`, `uninstall.ps1`
- `agent/packaging/build-unix.sh`
- `agent/packaging/linux/cyberorbit.service`, `install.sh`, `uninstall.sh`, `cyberorbit-desktop.desktop`
- `agent/packaging/macos/com.cyberorbit.agent.plist`, `com.cyberorbit.desktop.plist`, `desktop-monitor.command`, `install.sh`, `uninstall.sh`
- `agent/test/core.test.js`, `files.test.js`, `windows.test.js`, `integration.test.js`, `check-database.js`, `static-checks.js`
- `agent/README.md`, `CHANGES.md`, `VERIFICATION.md`

## Backend and migration

- New `server/services/endpoint-service.js`, `server/routes/endpoint.js`
- `server/routes/index.js` — mounts new endpoint routes
- `server/server.js` — endpoint payload limit, explicit loopback proxy trust, production static output path matching Vite
- `server/routes/events.js`, `server/services/sse.js` — authenticated/scoped stored events and live streams; preserves existing domain event formatting
- `server/routes/telemetry.js` — limits legacy ingestion to authenticated administrators and company-authorized targets; removes identity debug logging
- `server/repositories/user-repository.js` — retains company identity when mapping users for stream filtering
- New no-op `prisma/migrations/20260918000000_remove_default_risk_scores/migration.sql` repairs the pre-existing empty directory without altering risk defaults

## Frontend and root configuration

- New `client/src/components/EndpointMonitor.jsx`
- `client/src/pages/DevicesPage.jsx`, `EmployeeDashboard.jsx` — endpoint panel; employee page removes synthetic fallback devices/other employees' fallback events
- `client/src/App.jsx` — obtains secure stream tickets and dispatches endpoint update notifications
- `package.json` — agent test/build convenience scripts
- `.gitignore` — dependency/build/agent local credential/queue artifacts ignored

Generated, ignored build artifacts: `agent/dist/CYBERORBIT-windows.zip`, `agent/dist/windows/`, `agent/dist/windows-sha256.txt`, root `dist/`. No credentials or enrollment tokens are committed.

## Enrollment diagnostics fix (agent 1.0.1)

- Shared enrollment schema/local token preflight: `agent/shared/contract.js`, `agent/src/enrollment.js`, `agent/src/cli.js`.
- Bounded redacted backend error propagation: `agent/src/uploader.js`.
- Field-specific error codes, request IDs, safe parser errors, token state and active employee checks: `server/services/endpoint-service.js`, `server/routes/endpoint.js`, new `server/middleware/endpoint-errors.js`, `server/server.js`.
- Early installer token validation, guarded cleanup, correct package version: `agent/packaging/windows/install.ps1`, new `reset-incomplete.ps1`, `build.ps1`, `agent/package.json`.
- Regression tests: new `agent/test/enrollment.test.js`, `server/test/enrollment.test.js`; root `package.json` adds `test:enrollment`.
- Updated README/verification. No database migration, production record mutation or credential logging is required.

## Repeated token-format failure fix (agent 1.0.2)

- Confirmed extracted `agent/dist/install-kit/build-manifest.json` still reported 1.0.0. The builder now refreshes this kit and refuses local state/reparse points.
- `agent/packaging/windows/install.ps1` adds an explicit clipboard enrollment mode that waits for Copy token after command entry.
- New `enrollment-input.ps1` validates hidden/clipboard input and reports only the character count on failure, before any staging or HTTP request.
- Updated agent package/wire version, README and verification; added `agent/test/windows-enrollment-input.test.js` to `test:enrollment`.
- Backend, company authentication, expiry, single-use exchange, credential revocation, real install data and backup directories remain untouched by this packaging/input change.

## Installed LocalSystem service repair (1.0.3)

- `agent/src/native.js`: bounded private stderr classification, helper/exit/category diagnostics, process-scoped PowerShell policy argument, allowlisted helpers and cleanup on timeout/output-limit failure.
- `agent/src/desktop-helper.js`: same PowerShell launch policy and sanitized failure diagnostics for streaming desktop helper.
- `agent/src/service.js`: release the service lock on credential/startup failure.
- New `agent/src/windows-service-diagnostic.js` and `agent/packaging/windows/update-installed.ps1`: LocalSystem before/after probe and guarded code-only installed update with rollback, encrypted-data/ACL preservation and a running-service check.
- Agent version 1.0.3, native diagnostics/lock regression tests and existing desktop test updated to use actual launch arguments; documentation updated.
- `vault.ps1` and its LocalMachine protection, credentials, queue formats, device enrollment, backend and machine execution policy are not changed.

## Application usage visibility follow-up

- `server/services/endpoint-service.js`: optional validated application-usage filter applied before the 150-row limit, deterministic ordering and honest truncation metadata, preserving company/employee scope and unfiltered callers.
- `server/routes/endpoint.js`: forwards the optional filter through the existing dashboard route.
- `client/src/components/EndpointMonitor.jsx`: defaults to Application usage, retains All activity, displays timing/idle semantics and truncation notice; exposes event IDs for browser verification.
- New `server/test/application-usage.test.js`: process-flood regression, result limits, filter validation and employee/company isolation with isolated database fixtures.
- `server/test/device-buttons.browser.test.js`: real browser verifies both usage names despite newer process noise and switching to All activity without breaking existing buttons.
- Root `package.json`: `test:usage` command. README/verification document the trace and actual stored/rendered foreground events.
- Installed agent code, enrollment, credentials, queue data, DPAPI, ACLs and collector configuration are unchanged. Temporary read-only diagnosis scripts/reports are ignored under `agent/local/`.

## Application usage presentation follow-up

- `client/src/components/EndpointMonitor.jsx`: prominent friendly application names and duration, Application picker, clickable per-application summaries explicitly scoped to loaded observations, collapsed JSON details and scroll reset when selecting an app. Unattributed activity does not display an employee actor.
- `server/test/device-buttons.browser.test.js`: verifies Notepad/Brave headings, visible duration, collapsed details, dropdown/card selection and restoration of all applications alongside existing device actions.
- README/verification updated. No backend or installed agent change is needed for this presentation fix.
