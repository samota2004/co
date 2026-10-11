# Devices button fix and verification

## Root causes

1. Endpoint management requests failed with `426` on the local HTTP development server because `ENDPOINT_ALLOW_LOOPBACK_HTTP` was absent. A stale backend process continued returning the old error after the source and `.env` were corrected. Both root and `server/` `npm run dev` now use `server/dev.js`: it loads the root configuration before importing the backend, explicitly selects development and defaults to loopback HTTP (an explicit false setting is respected). Restart after changing backend source or `.env`. Production startup does not use this entry point and still rejects HTTP; agent TLS validation is unchanged.
2. `EndpointMonitor` called `new Error(data.error)` when authentication middleware returned `{error:{code,message}}`, rendering `[object Object]`. `client/src/services/api.js` now handles string/nested errors, authentication, timeout/network errors, malformed/non-success responses and the existing bearer token consistently.
3. The only assignment control combined device creation and enrollment-token issuance. There was no route for issuing a replacement token against an existing assigned device. Assignment now uses the existing `/assign` route independently; a real administrator-authorized token route is implemented, not a frontend-only success.
4. `GET /api/devices` incorrectly returned `{success:true,users:...}`. The device registry expected `devices` and silently stayed empty. The route now reads the existing `Device` table with authenticated company/user scope, returns `devices` and keeps the registry's existing display fields.
5. Registry Refresh delegated to the parent SOC refresh, whose fault-tolerant API helper returned failed responses rather than throwing. The page never saw these errors. Both page Refresh controls now call their real data routes and expose loading/error states. Parent employee refresh also had a positional-destructuring bug when it omitted the users request; its placeholder now keeps other response positions correct.

## Click-to-database trace

| Button | UI and frontend | Route / authorization | Database / response |
|---|---|---|---|
| Assign | `EndpointMonitor.assign`, checks company employee options, selected device or new laptop name; disables duplicate submissions | Existing `POST /api/endpoint/assign`, MFA JWT + security/system administrator; UI sends `issueEnrollmentToken:false` | Creates or updates `EndpointDevice`; validates active same-company employee and existing device ownership/platform; forbids moving enrolled/revoked records. Visible success only after durable save |
| Issue Enrollment Token | `EndpointMonitor.issueToken`; requires selected saved assignment; displays token once with Copy/Dismiss | Implemented `POST /api/endpoint/:id/enrollment-token`, MFA JWT + administrator + company scope | Updates the assigned unenrolled device's `enrollmentHash` and 15-minute expiry. Only hash is stored; token returned with `Cache-Control:no-store`. Replacement invalidates previous token; enrolled/revoked/invalid assignments fail |
| Agent panel Refresh | `EndpointMonitor.refresh`, authenticated request, loading/disabled state, preserves last good list on failure | Existing `GET /api/endpoint/dashboard`, MFA JWT, company/employee scope | Reads EndpointDevice/Event/Incident plus active same-company employee options; never returns enrollment secrets |
| Registry Refresh | `DevicesPage.refreshDevices`, calls both stores directly; errors are not swallowed by the parent | Existing `GET /api/devices` plus panel refresh above | Authenticated scoped reads from existing Device table and endpoint dashboard; updates actual displayed records |

The original combined assignment API remains compatible: callers that omit `issueEnrollmentToken:false` still receive their initial enrollment token. No schema migration is needed for this fix.

## Manual checks

Restart the backend (`npm run dev`) and sign in as an administrator with MFA. Open Devices.

For localhost development, run `npm run dev` from the project root and open `http://localhost:3000`, or use `npm run dev` from `server/` alongside the existing client Vite server at `http://localhost:5173`. Neither local workflow needs deployment or a TLS certificate. The employee dropdown reports loading, request failure or an actually empty active employee list distinctly; it never substitutes fake employees.

1. **Assign:** click with no employee to see validation. Choose an active employee and either an existing unenrolled laptop or Register a new laptop + name. Click Assign. The confirmation and real assigned record should appear. Reassign the same unenrolled device to another employee and confirm no duplicate device is created. Invalid SID shows the backend validation message. Enrolled/revoked records cannot be reassigned.
2. **Issue Enrollment Token:** select the saved device and matching employee, click the button, then Copy token. The token appears with expiry and can be dismissed. Refresh/page navigation never retrieves it. Issuing another token invalidates the previous one. Missing assignment, expired login, cross-company requests, enrolled/revoked devices show errors rather than success.
3. **Refresh:** click both the panel Refresh and the registry Refresh. While pending, loading/disabled states appear. Each list reloads its actual store. If the backend/database is unavailable, an error remains visible and the previous good list stays intact. Restore connectivity and refresh to recover.

Browser Network should show `/api/endpoint/assign`, `/api/endpoint/DEVICE_UUID/enrollment-token`, `/api/endpoint/dashboard`, and `/api/devices`, each with the bearer header. Do not copy tokens/JWTs into logs/screenshots. The backend reports operation/status/error code without credential bodies.

## Automated checks

```powershell
npm run build
npm run test:devices
node --test agent/test/*.test.js server/test/device-buttons*.test.js server/services/test-ml-feature-aggregator.js
```

The browser suite uses the built React app and actual full API router in headless Chrome. Set `CYBERORBIT_TEST_BROWSER` to another Chromium executable if required. External Google Fonts requests are disabled in the test to avoid restricted-network stylesheet delays; the actual application, local assets and backend routes are used. It verifies clicks, clipboard, both refresh controls, loading, visible 400/401/503 errors, browser JavaScript/console errors, network status and real database rows/token hashes. Deliberate outage/error cases never replace successful backend responses with fake data.

Executed in this workspace: 13 regression tests passed (including the actual browser), frontend and server production builds passed, and Prisma schema validation passed. Browser console had no JavaScript exceptions or `console.error` calls; no unexpected missing-route 404 or local HTTPS-configuration 426 occurred. Large frontend chunk and Prisma configuration deprecation warnings remain from the existing project.

Localhost follow-up: restarted the identified stale backend, leaving the client's existing Vite process running. Authenticated reads through both `http://localhost:3000` and `http://localhost:5173` returned HTTP 200 and the two real active employees in the administrator's company. Rebuilt the frontend/backend and reran all three Devices tests successfully, including initial employee-fetch failure, disabled empty/error dropdowns, actual empty active-employee state and recovery. No real employee or device records were modified for this verification.

Database suites create and remove only randomly named isolated test schemas. Existing employees, devices and agent credentials in the configured application schema are not changed. Local `.env` has only the explicit development-loopback flag added; credentials were neither printed nor committed.

Changed implementation: `client/src/components/EndpointMonitor.jsx`, `client/src/services/api.js`, `client/src/pages/DevicesPage.jsx`, `client/src/App.jsx`, `server/services/endpoint-service.js`, `server/routes/endpoint.js`, `server/routes/devices.js`, `package.json`. Tests: `server/test/device-fixture.js`, `device-buttons.test.js`, `device-buttons.browser.test.js`, existing `agent/test/core.test.js` fixture updated for active-user validation. Documentation: this file and the agent guide's enrollment instructions.

Localhost follow-up changed `server/dev.js`, both root and server `package.json` development scripts, `client/src/components/EndpointMonitor.jsx`, `server/test/device-buttons.browser.test.js` and this document.

## Duplicate server startup

Run one backend at a time: either `npm run dev` from the root or `npm start` / `npm run dev` from `server/`. Stop it with Ctrl+C in that terminal before launching another. Keep the separate client Vite process if using port 5173. Never kill all Node processes to free one backend port.

`server/server.js` now reserves the API port before creating Vite, gives a concise error on an occupied port and attaches development HMR to the same HTTP server. It no longer creates a second WebSocket listener on port 24678. Requests during frontend initialization receive a retryable 503 until the full application is ready. Production static serving and the configured API port are preserved.

Run `npm run test:startup` from the root. The regression tests launch the actual backend with database access disabled, verify that a duplicate launch exits cleanly, and verify HTTP, the Vite client and an authenticated HMR WebSocket on the same port while port 24678 is deliberately occupied. Each test stops only its own processes and listeners.

Verified: both startup tests and all three Devices tests passed. The earlier agent-started backend was stopped. A subsequent independently started `node server.js` process was left running: `/health` returns 200, anonymous endpoint dashboard returns 401 rather than 426, and there is no listener on port 24678. The frontend Vite build and backend esbuild bundle passed. `npm run build` initially stopped at Prisma generation because Windows locked the already loaded Prisma DLL; no schema change was required, and the two build stages were run separately using the existing generated client. For future Prisma generation/builds, stop the backend first.
