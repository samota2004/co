# CYBERORBIT Project Health Audit

**Audit date:** 2026-10-24
**Scope:** Application health audit plus follow-up repairs of the Devices browser test fixture and custom synthetic simulator/API contract. The simulator route/UI and regression tests were changed; model, schema, metadata, notebook, credentials, enrollment state, queued events, and employee assignments were not modified.
**Overall status:** **PARTIALLY WORKING; not production-ready as an end-to-end employee-monitoring system.**

## Executive assessment

CYBERORBIT is a substantial React/Express/PostgreSQL application with a separate endpoint agent and a Python Random Forest inference service. Authentication, admin MFA, protected-resource decisions, scoped endpoint ingestion, policy/risk persistence, incidents, audit records, and guarded model inference have meaningful integration tests. The application can serve its API and SPA, and an isolated Windows-agent test exercised observation through durable storage to the scoped dashboard.

The main functional boundary is deliberate: employee/manager console login is denied, and endpoint observations are not translated into the model’s CERT-derived 21-feature input. The active ML screen accepts only a complete administrator-supplied prior-day aggregate. Therefore, the application does not yet perform continuous RF analysis of live employee endpoint activity, and the project has no verified production employee session/resource gateway. Other confirmed issues include a development startup WebSocket test timeout and orphaned architecture/demo UI code referring to unavailable routes. The root `.env.example` referenced by the README is absent. The Devices browser regression was traced to a stale test build/assertion and its fixture now passes. The custom simulator form now uses a separate bounded, administrator-only synthetic assessment route; generic telemetry remains fail-closed and no RF inference is claimed.

These findings describe the inspected working tree on the audit date. Many source files were already modified or untracked at audit start; this report does not attribute those earlier changes to this audit.

## Architecture and module inventory

| Area | Actual implementation and integration | Status |
|---|---|---|
| Frontend | React 19, Vite 6, JSX; custom pathname/page state in `client/src/App.jsx`, Tailwind v4, Recharts; page modules under `client/src/pages/`. | PARTIALLY WORKING |
| Backend/API | Node.js ES modules, Express 4; active server `server/server.js` mounts `server/routes/index.js`. `server/routes/api.js` is a separate legacy router and is not mounted by the active server. | WORKING in local integration tests |
| Database | PostgreSQL via Prisma; schema `prisma/schema.prisma`, migrations in `prisma/migrations/`, seed in `prisma/seed.js`. Automated fixtures create and remove random isolated schemas. The configured non-test database’s migration state was not inspected or changed. | PARTIALLY WORKING |
| Authentication | Password login, admin-only authorization, MFA challenge/verify, JWT plus persisted session/refresh rotation, session listing/revocation, logout and password reset. Employee/manager login is intentionally denied in `server/services/auth-service.js`. | PARTIALLY WORKING; no external IdP |
| Endpoint agent | Separate JavaScript agent in `agent/src/`; Windows/Linux/macOS collectors, enrollment exchange, device credential, validated observations, encrypted local queue, upload/acknowledgment. A Windows fixture ran an actual local agent-to-backend-to-database-to-dashboard path. | PARTIALLY WORKING; deployed employee enrollment not verified |
| Endpoint dashboard | `server/services/endpoint-service.js`, `/api/endpoint/dashboard`, `client/src/components/EndpointMonitor.jsx`; API applies scope and filters before limits. Browser test for application-usage rows failed as described below. | PARTIALLY WORKING |
| Contextual risk / Zero Trust | `server/services/security-service.js`, `cyber/risk-engine/risk-engine.js`, `server/services/authorization-policy.js`; derives principal/resource/device and persisted trust/incident state server-side; protected resource access returns data only after policy allows it. | WORKING in integration tests; production deployment not verified |
| Trust and recovery | Persisted risk/trust history and gates in PostgreSQL; recovery conditions and critical holds covered by security tests. Thresholds are configurable policy defaults, not empirically optimized. | WORKING in tested local paths |
| ML inference | `ml/src/app.py`, `ml/src/inference.py`, Node adapter `server/services/ml-service.js`, routes `server/routes/ml.js`; exact schema validation, model fingerprint agreement, positive-class score validation, timeout/failure handling, XAI attribution; only guarded complete aggregate import reaches inference. | WORKING for guarded import; no live endpoint feature path |
| Research tooling | `ml/research/experiment.py`, `calibration.py`, `raw_user_day.py`, provenance/leakage checks and synthetic fixtures. CERT files/README/answer archive are absent; no genuine evaluation was run. | PARTIALLY WORKING; real-data use BLOCKED |
| Incidents and approvals | Database-backed create/status/resolution and access-request/review routes in active security routes; transactional audit writes and role/scope checks. | WORKING in local security integration tests |
| Audit | PostgreSQL `AuditLog`, company/user scoping, filters/export, sensitive-field redaction in `server/services/security-common.js`. Not tamper-evident against database administrators. | PARTIALLY WORKING |
| Notifications | Mailjet HTTPS implementation in `server/services/email-service.js`; unit/security tests mock provider. Real sender/account/delivery was not exercised. | BLOCKED for live delivery; code path tested with mocks |
| Copilot/XAI | SHAP feature attribution in Python for RF; advisory Gemini boundary in `server/services/gemini.js`, with local rule summary when external AI disabled. | PARTIALLY WORKING; external Gemini not tested |
| Geolocation | Optional local city database/provider in `server/services/endpoint-city.js`; configuration, download, and local lookup tests exist. External provider and deployment data availability were not checked. | PARTIALLY WORKING / external configuration BLOCKED |
| OpenAPI | `server/openapi.json` parses as OpenAPI 3.1 JSON and describes 75 paths. Several dormant UI calls are not documented because those routes do not exist. | PARTIALLY WORKING |
| Background jobs | Endpoint retention scheduler starts with the server; no general job queue or worker system is present. | PARTIALLY IMPLEMENTED |
| Architecture page | `client/src/pages/ArchitecturePage.jsx` is not imported/rendered by `App.jsx` or linked in the sidebar. Its API explorer asks for `/api/system/routes`; attack/mitigation buttons call `/api/cyber/*`, absent from the active server. | NOT IMPLEMENTED in active UI; stale component |
| Profile page | `ProfilePage.jsx` exists but is not imported/rendered. `SecurityProfilePage.jsx` is a separate employee risk/trust page; account/session settings are under Settings. | NOT IMPLEMENTED as a distinct profile route |

## Feature-by-feature status

“Working” here means exercised in a relevant local test, not production certification.

| Feature | Files / active endpoint | Status | Evidence and user impact |
|---|---|---|---|
| Landing and login screens | `client/src/pages/LandingPage.jsx`, `LoginPage.jsx`; `/api/auth/*` | PARTIALLY WORKING | Browser security-flow test passed password/MFA flow. Landing contact form posts to a hard-coded Formspree endpoint (`LandingPage.jsx`); live external submission was not tested. |
| Administrator login/MFA | `server/routes/auth.js`, `server/services/auth-service.js`, `session-service.js` | WORKING locally | Security/browser tests cover admin MFA, email failure behavior, expiry, refresh and logout. Real Mailjet delivery was not tested. |
| Employee/manager login | Same auth files; frontend employee portal | NOT IMPLEMENTED by design | Backend rejects employee password assignment/login; security test confirms denial. Employee dashboard UI is not evidence of a usable employee session. |
| Roles and company/employee scoping | `security-common.js`, `middleware/auth.js`, active route handlers | WORKING in tests | Tests exercise assigned administrator scopes, other-company denial, unauthenticated/forbidden requests and protected-resource checks. Existing production tenant data was not inspected. |
| Employee management | `EmployeeManagementPage.jsx`, active `/api/users`, admin assignment options | PARTIALLY WORKING | Backend/admin assignment and persistence tests passed. Browser full workflow was not independently exercised in this audit. |
| Device registration and enrollment | `DevicesPage.jsx`, `EndpointMonitor.jsx`, `/api/endpoint/*`, agent enrollment | PARTIALLY WORKING | `npm run test:enrollment` passed 5/5; agent integration exercised real local Windows observation and durable insert. Actual user laptop enrollment was not attempted. |
| Endpoint observations and dashboard | Agent collectors, `EndpointService`, `/api/endpoint/ingest` and `/dashboard` | PARTIALLY WORKING | Agent test suite 77 passed; one browser Devices usage-row test failed. The full local RF feature pipeline is intentionally not connected. |
| Risk analysis and history | `AiRiskAnalysisPage.jsx`, `/api/risk/*`, `security-service.js` | WORKING in tested backend | Security suite checks risk boundaries, malformed inference handling, and no writes on unavailable/malformed model results. Live employee threat efficacy is not established. |
| Contextual Zero Trust/resource access | `ResourcesPage.jsx`, `/api/resources/:id/access`, authorization policy | WORKING in local integration | Tests verify server-bound identity, roles, trust, holds, resource sensitivity, risk-based MFA/approval and that approval cannot grant a missing role. Production gateway/IdP unavailable. |
| Trust score / recovery | `security-service.js`, persisted `TrustHistory` and audit | WORKING in tested local paths | Tests cover validated benign days, duplicate/backdated/concurrent evidence, unresolved incidents and recovery restrictions. Default values have no operational evaluation. |
| Simulator predefined scenarios | `SimulatorPage.jsx`, `/api/simulation/scenarios` and `/scenario/:id` | PARTIALLY WORKING | Security tests exercise synthetic scenarios through actual risk/policy/database pipeline. These are synthetic records and can change demo account state. |
| Simulator custom form | `client/src/pages/SimulatorPage.jsx` posts `/api/simulation/custom`; `server/routes/simulation.js` validates bounded synthetic fields and calls contextual assessment | WORKING in local tests | Browser and API integration tests verify the form reaches the synthetic assessment flow, persists a synthetic marker and audit decision, and does not call RF inference. This is not production telemetry or model-accuracy evidence. |
| ML metrics/models/health/predictions | `MlAnalyticsPage.jsx`, `/api/ml/{metrics,models,health,predictions}` | PARTIALLY WORKING | Authenticated production-server smoke and ML integration tests passed. Displayed saved metadata metrics are explicitly not independently reproduced; no real CERT inputs exist. |
| ML aggregate import | `/api/ml/predict`, Node/Python service | PARTIALLY WORKING | Security integration reached actual Python model, SHAP, persisted prediction and policy assessment with a test aggregate; incomplete feature inputs and model fingerprint mismatch failed closed. This is administrator-supplied aggregate inference, not live endpoint inference or model-performance evidence. |
| Explainability | Python `xai.py`/SHAP and policy contributing factors; `ExplainableAiPage.jsx` | PARTIALLY WORKING | Inference test and security integration exercised SHAP. Rule factors are separate from RF attribution; page-level browser rendering was not tested. |
| Dashboard statistics | `DashboardPage.jsx`, `/api/dashboard/*`, `/api/stats` | PARTIALLY WORKING | Production source-server smoke test served API/SPA; database suite includes dashboard-facing data paths. Full visual dashboard workflows were not browser-verified. |
| Incidents and investigation | `IncidentsPage.jsx`, active `/api/incidents*` routes | WORKING in local tests | Security tests verify incident persistence, holds, status/recovery effects and audit decisions. Human operational process was not evaluated. |
| Access requests and approvals | `AccessRequestsPage.jsx`, `/api/access-requests*` | WORKING in local tests | Security suite covers request tampering/review and policy role boundaries. Manager console authentication remains disabled, so manager-review workflow is not available as a production login flow. |
| Audit logs | `AuditLogsPage.jsx`, `/api/audit-logs*` | PARTIALLY WORKING | Writes are transactionally invoked in security paths and tests verify sensitive decisions. No centralized immutable archive is configured. |
| Policies | `PoliciesPage.jsx`, `/api/policies` | WORKING in tests | Policy boundary and persistence paths are covered in security suite; defaults are not experimentally optimized. |
| Settings/sessions/password | `SettingsPage.jsx`, `/api/auth/sessions*`, password-change | PARTIALLY WORKING | Session security tested; user-visible full settings browser flow not exercised. |
| Contact form | `LandingPage.jsx` → external Formspree URL | BLOCKED for live verification | Requires external network/service and owner-approved destination; not called during audit. |
| Mail notifications | Mailjet service and auth flows | BLOCKED for live verification | Provider requests are mocked in tests; verified sender credentials/configuration and inbox delivery unavailable/unverified. |
| External Gemini | `server/services/gemini.js` | BLOCKED for external mode | Optional; local summary path exists. No external call or key/config check was performed. |
| Architecture/API playground | Orphan `ArchitecturePage.jsx` | NOT IMPLEMENTED in active app | No App route/sidebar link; endpoint catalog absent; `/api/cyber/mitre-simulate` and `/api/cyber/mitigate` are not registered. |
| Separate user profile | `ProfilePage.jsx` | NOT IMPLEMENTED as active route | No import or render branch in App. Security profile and Settings cover different functions. |
| CERT real-data pipeline/evaluation | `ml/research/*`, expected `ml/data/cert-r4.2/` | BLOCKED | `ml/data/cert-r4.2` and expected raw/answer inputs absent. Unit fixtures only. |

## Frontend/backend/database integration

The active runtime sequence is:

```text
Browser React app
  ├─ same-origin /api/* calls (session transport attaches JWT/refresh behavior)
  ├─ Express server/server.js
  │    ├─ security headers, CORS allowlist, JSON limits and endpoint-specific guards
  │    ├─ routes/index.js: public auth + endpoint credentials, then requireAuth for app API
  │    ├─ security/service modules → Prisma/PostgreSQL
  │    ├─ endpoint agent routes → validated device credential → durable EndpointEvent
  │    └─ /api/ml/predict → 21-field validation → Node service adapter → Python FastAPI
  │                            → saved RF + SHAP → backend risk/policy → DB prediction/audit
  └─ SSE stream uses short-lived session ticket and company/user-scoped events
```

Confirmed implementation details:

- `server/server.js` starts Express, mounts the active router and serves Vite middleware in development or `client/dist` in production. `/health` is a lightweight process health route; `/api/system/health` additionally probes PostgreSQL and ML and labels Gemini only as configured/not-probed.
- `server/routes/index.js` registers `/endpoint`, `/auth`, and `/events` before `requireAuth`, then mounts the authenticated security, device, simulator, ML, copilot, system, and administrator routes. `server/routes/api.js` and the older `activity.js`, `resources.js`, etc. modules are not the active server router. Do not infer runtime reachability from those files alone.
- Agent credentials and enrollment are separate from browser JWT sessions. Endpoint event persistence has a device/event uniqueness constraint and company/device/user attribution fields. Local integration passed; actual production endpoint enrollment is not verified.
- `/api/telemetry/ingest` intentionally refuses generic app/endpoint telemetry with `ML_DATA_INCOMPLETE`; no pseudo-feature aggregate is persisted or inferred. `/api/ml/predict` accepts only a prior-day date and a complete exact schema object, then calls the existing model path.
- Node reads `CYBERORBIT_MODEL_DIR` or project-relative `ml/models`; it validates the ordered feature schema and metadata, fingerprints model+schema+metadata, compares against Python health/prediction fingerprints, validates positive-class score and threshold, and times out after 15 seconds. No fallback prediction is returned on service failure.
- A successful policy evaluation uses authenticated server identity and persisted user/resource/device/trust/incident state. The security test suite exercised actual risk-to-MFA, hold/freeze, resource denial, trust recovery and audit persistence in temporary schemas.
- Database tests migrated only their unique temporary schemas. The actual root `.env` database migration/version state was not queried or changed. Production database deployment remains unverified.

### Confirmed frontend gaps

1. **Custom simulator/API mismatch (resolved in this follow-up).** The form previously submitted `/api/telemetry/ingest`, whose `ML_DATA_INCOMPLETE` rejection is intentional. The form now submits the bounded `/api/simulation/custom` contract; the original generic route remains guarded. The browser/API tests verify the assessment is synthetic, scoped, audited, and does not invoke RF inference.
2. **Stale architecture/demo component.** `ArchitecturePage.jsx` calls `/api/system/routes` and `/api/cyber/mitre-simulate` / `/api/cyber/mitigate`; those endpoints do not exist in the active router. The page is not reachable from `App.jsx` or the sidebar, so it is dormant rather than a currently exposed production control.
3. **Separate profile page is dormant.** `ProfilePage.jsx` is not imported or rendered; `SecurityProfilePage.jsx` is an employee risk view and Settings covers session/password functions.
4. **Devices browser test fixture was stale (resolved in this audit).** The test served ignored `client/dist`, whose bundled asset predated the current source commit, and expected detailed timeline rows before selecting an application. Current `EndpointMonitor.jsx` intentionally starts with application summaries and reveals records only after selection; the test also used the obsolete search label `Application filter` instead of `Find an application`. The corrected test builds current source into a temporary directory, directly verifies the authenticated `eventType=APPLICATION_USAGE` API response contains both expected rows despite 180 newer process events, then exercises summary/detail/search behavior. Focused browser and device regression suites pass. This was a test-fixture defect; no production route or component change was needed.
5. **Large frontend bundle warning.** Current source builds, but Vite reports the minified JS chunk is 1,125.47 kB (>500 kB warning threshold). This is a performance/maintainability concern, not a build failure.

OpenAPI document parses as JSON/OpenAPI 3.1 with 75 paths. It includes major active API groups and documented ML/endpoint contracts, but it does not include `/api/system/routes` or `/api/cyber/*` referenced by the dormant ArchitecturePage. An actual coverage check of every route/method/schema pair was not performed.

## Authentication and authorization

The supported browser login is administrator password plus MFA. The password/MFA browser test passed. Admin MFA requires email delivery except for explicit loopback development mode. JWTs are short-lived; refresh uses an HTTP-only same-site cookie/CSRF marker and persisted revocable sessions; `requireAuth` verifies user status, role/auth version and persisted session. Logout revokes the server session. Security tests exercised admin session expiry and logout, employee login denial, spoofed authorization fields, SQL-like identifiers and request size limits.

Employee and manager passwords/login are rejected in backend logic and the README explicitly states that employee console login and a production employee resource gateway are not implemented. This is an intentional security limitation pending an identity-provider, role mapping, MFA and session design—not a broken login control to bypass. Employee dashboard/profile code should not be represented as production employee access.

Resource access is server-side and bound to the authenticated principal. Policy tests verify role, resource sensitivity, current risk, trust, approval, active hold and critical incident checks. Manager review routes exist, but the manager console login restriction prevents a full manager-session workflow. Production IdP, real employee session, corporate resource gateway, and real MFA provider delivery are unverified.

## Critical workflows

| Workflow | Result | Evidence / boundary |
|---|---|---|
| A. Startup → database → health → frontend | PARTIALLY VERIFIED | Production source-server test passed: API, authenticated scoped users/ML metrics, 404, static SPA, CSP, and insecure endpoint HTTP rejection. The separate development startup test passed duplicate-port handling but failed when fetching `/@vite/client` due a timeout. The deployed environment was not accessed. |
| B. Login → MFA → protected route → logout | PARTIALLY VERIFIED | Browser test passed admin password/OTP login; security suite passed persisted session expiry/logout and authorization. Employee login is intentionally denied; production IdP/Mailjet delivery not tested. |
| C. Enrollment → credential → ingest → persist → dashboard | PARTIALLY VERIFIED | `npm run agent:test` includes a real local Windows process observation through test enrollment, authenticated HTTP, isolated PostgreSQL persistence and employee-scoped dashboard response (77 pass; 6 macOS/Unix skips). The browser usage rows are separate synthetic fixtures. This does not verify an installed production employee agent or browser-rendered production telemetry. |
| D. Security event → risk/policy → incident/audit → dashboard | PARTIALLY VERIFIED | Backend tests cover security scenarios, persisted trust, incident holds, policy decisions and audits. Predefined synthetic scenario path exists. No real production employee event was injected. |
| E. Complete aggregate → RF → policy → audit/prediction | PARTIALLY VERIFIED | Security suite’s model pipeline test ran the checked-in Python model with a schema-valid test aggregate, SHAP and persisted results. It also tested model version mismatch. This proves plumbing, not data provenance or accuracy. |
| F. Incomplete aggregate → error/no prediction | WORKING in tests | Security tests verified `ML_DATA_INCOMPLETE`, malformed/unavailable service behavior and no invalid prediction/risk write. |
| G. Access request → review → policy → audit | PARTIALLY VERIFIED | Backend security tests cover request/review and role enforcement. No manager browser session exists and no manager login is supported. |
| H. Incident → investigate → resolve → audit | PARTIALLY VERIFIED | Backend tests cover incident persistence/holds/resolution effects and audit. Full UI operator workflow was not browser-driven. |

## Test and build results

All commands below were actually run on 2026-10-24. Database-backed suites used the project’s loopback PostgreSQL test fixture, which creates a uniquely named temporary schema, applies migrations, and drops only that schema.

| Command | Outcome |
|---|---|
| `npm run test:security` | **PASS: 27, FAIL: 0, SKIP: 0.** Includes auth/MFA, resource authorization, risk/trust/holds/recovery, guarded model integration, policy replay, abuse handling, production source-server smoke. Initial sandbox attempt returned `spawn EPERM` before tests ran; rerun with approved local test execution completed successfully. |
| `npm run test:enrollment` | **PASS: 5, FAIL: 0, SKIP: 0.** Enrollment field validation, expiry/reuse/revocation/single-use and actual Windows installer input checks. |
| `npm run agent:test` | **PASS: 77, FAIL: 0, SKIP: 6.** Six platform-specific macOS/Unix tests skipped on this Windows host. Includes actual local Windows observation → HTTP → test PostgreSQL → employee dashboard integration. |
| `python -B -m unittest ml.test.test_inference -v` | **PASS: 4 tests.** Loads the saved model and exercises schema, HTTP contract, SHAP and non-fabrication safeguards. Scikit-learn emitted a feature-name warning because the artifact was fitted without feature names; tests still passed. |
| `python -B -m unittest discover -s ml/test -v` | **PASS: 28 tests.** Research/calibration/raw staging/provenance/leakage/split tests use synthetic fixtures and temporary output folders. They are software tests, not model-performance evidence. |
| `node --test --test-concurrency=1 server/test/device-buttons.browser.test.js` | **PASS: 1, FAIL: 0, SKIP: 0** after fixing the test fixture. It compiles current frontend source to a temporary directory, verifies the authenticated filtered API returns exactly two usage events despite a process-event flood, and follows summary → selected-application detail → search → refresh/error paths. Earlier reproductions failed because stale ignored `client/dist` was served and assertions/selectors did not match the current summary-first UI. |
| `npm run test:devices` | **PASS: 4, FAIL: 0, SKIP: 0.** Includes the corrected browser regression, Devices API/helpers, assignment/token/authorization regressions, and browser clipboard behavior. |
| `node --test --test-concurrency=1 server/test/simulator-custom.test.js server/test/simulator-custom.browser.test.js` | **PASS: 2, FAIL: 0, SKIP: 0.** Browser test confirms form `POST /api/simulation/custom` returns 200 and persists synthetic/simulation markers; API test confirms strict field validation, tenant/role boundaries, audit persistence, no RF prediction, and continued generic telemetry rejection. |
| `npm run test:api` | **PASS: 11, FAIL: 0, SKIP: 0.** API, enrollment, admin auth and application usage regression suite. |
| `npm run test:security` | **PASS: 27, FAIL: 0, SKIP: 0.** Security and model-guard regression suite. |
| `npm run test:enrollment` | **PASS: 5, FAIL: 0, SKIP: 0.** Enrollment and endpoint credential regressions. |
| `npm run test:devices` | **PASS on isolated rerun: 4, FAIL: 0, SKIP: 0.** A concurrent first run had a blank-page failure in the unrelated UUID browser test while multiple Prisma/Chrome suites ran; the isolated rerun passed all four tests. |
| Vite production build to a temporary OS directory | **PASS.** The first restricted attempt failed before compilation with Windows esbuild `spawn EPERM`; rerun with approved local process execution built current frontend successfully. The existing >500 kB chunk warning remains. |
| `node --check` for `server/routes/simulation.js` and both simulator tests; OpenAPI JSON parse and route check | **PASS.** No syntax errors; `/api/simulation/custom` is present in parsed OpenAPI JSON. |
| `npm run test:browser` | **NOT RERUN as a combined script in this session.** Its Devices component is covered by the focused browser test above; prior password/MFA browser result remains as previously recorded. |
| `npm run test:startup` | **PARTIAL/FAIL: 1 pass, 1 fail.** Duplicate-port startup behavior passed. Development backend/HTTP health started, but `/@vite/client` fetch timed out in the spawned server test. It ran with empty `DATABASE_URL` and in-memory Prisma mode; production smoke separately passed. |
| `vite build --config client/vite.config.js --outDir .audit-build-20261024` | **PASS.** Built 2,303 modules from current source to a new temporary directory, which was then removed. Vite reported a >500 kB chunk warning. Existing `client/dist` was not overwritten. |
| Node syntax check over `server`, `agent/src`, `client/src` `.js` files | **PASS: 140 files, 0 syntax failures.** JSX parsing was covered by Vite build. |
| Python `ast.parse` over `ml/**/*.py` | **PASS: 17 files parsed.** |
| OpenAPI JSON parse / route spot-check | **PASS for JSON parse; 75 paths.** Spot-check confirmed ML/endpoint/system-health paths, and confirmed stale system-route/cyber URLs absent. Full schema validation against an OpenAPI validator was not run. |
| `git diff --check` | **PASS (exit 0).** |

The standard `npm run build` was not run because it also regenerates the Prisma client and runs the city-database preparation script; the audit used a direct Vite build in a temporary output path to avoid changing generated or downloaded files. Lint/type-check scripts are not configured in the root package scripts. The broad `npm run test:api` and `test:city` suites were not separately run; relevant security, enrollment, agent, model, device and browser suites cover representative paths. `npm run test:devices` was run during the follow-up and passed.

## Reproducible findings and prioritized fix plan

| Priority / severity | Finding and evidence | User impact | Smallest independently testable next fix | Dependencies / risk |
|---|---|---|---|---|
| 1 — High | **No live endpoint-to-21-feature path.** Agent events are process/application/session/USB/file-change/socket observations; contract `ml/research/LIVE_TELEMETRY_CONTRACT.md` says none is established as the five model source families. `/api/telemetry/ingest` fails closed and `/api/ml/predict` requires an administrator-imported complete 21-feature day. | Continuous endpoint ML risk analysis is unavailable. | Keep current refusal; design and approve one source-specific telemetry schema and mapping, then integration-test it before enabling any feature. | Requires approved source semantics, privacy/collection review and complete 21-feature provenance; CERT files also absent. |
| 2 — High | **Employee/manager console auth and production resource workflow disabled intentionally.** `auth-service.js`; README; admin-only tests. | Employee/manager sessions and real user self-service are not available. | Select identity provider and review tenant/role mapping, MFA delivery, session, recovery and gateway architecture before implementation. | Requires owner/IdP configuration and security review; no safe local code-only bypass. |
| 3 — Resolved | **Custom simulator form/API mismatch.** The form previously called generic `/api/telemetry/ingest`, which correctly returned `ML_DATA_INCOMPLETE`. It now calls `POST /api/simulation/custom`; API/browser tests pass. | The form now runs a contextual synthetic assessment and persists its synthetic marker and audit record. No RF prediction is created. | Completed: strict custom schema, existing security-admin mount and employee scoping, clear OpenAPI contract, and browser/API regressions. | Synthetic assessments can change demo account risk/status; use the separate demo tenant as already instructed by the UI. |
| 4 — Resolved | **Devices browser test used stale assets and stale interaction assumptions.** `server/test/device-buttons.browser.test.js`; focused browser test and `npm run test:devices` now pass. | No application defect found. Before the test repair, the regression obscured whether the current Devices page could render filtered usage. | Completed: use a current-source temporary build, assert the filtered API contract, and follow the summary-first interaction. | Browser fixture usage rows are synthetic; they do not establish product detection performance. |
| 5 — Medium | **Development Vite startup test times out and setup instructions point to absent `.env.example`.** `server/test/server-startup.test.js` and README; no root `.env.example` exists. | Fresh developer setup and dev startup are less reliable; production source-server smoke passed. | Diagnose `/@vite/client` timeout in a clean isolated dev process; separately add a safe placeholder-only env template in an implementation phase. | Avoid exposing/overwriting existing `.env`; build template from documented variables only. |
| 6 — Low | **Dormant ArchitecturePage and ProfilePage; stale `/api/system/routes` and `/api/cyber/*` links.** Not imported/routed from `App.jsx`; route spot-check and active route tree confirm absent endpoints. | Planned architecture/API playground and separate profile screen are inaccessible; no current active workflow affected. | Decide whether to remove from navigation intent or explicitly integrate only after defining supported API contracts. | Stale component contains unauthenticated direct `fetch` calls; do not expose before auth/request contract review. |
| 7 — Low | **Frontend bundle warning.** Current Vite build produced a 1,125.47 kB minified JS chunk. | Slower first load on constrained clients; build succeeds. | Profile bundle and split heavy page/chart modules with lazy loading in a separate UI task. | Test route loading/error fallbacks; no security impact demonstrated. |
| 8 — Medium | **Live operational integrations not verified.** Mailjet tests mock HTTP; Gemini optional; city lookup optional; actual configured DB/IdP not inspected. | Email delivery, external AI and deployed environment availability remain unknown. | Use a staging environment with explicitly approved service credentials and test accounts, then conduct opt-in smoke checks. | Requires external service ownership/configuration; never paste secrets into audit output. |

## Model artifact integrity

Hashes captured at the start and end of this audit are identical:

| Artifact | SHA-256 before | SHA-256 after | Status |
|---|---|---|---|
| `ml/models/multi_source_ueba_rf.joblib` | `E41189B9093457BDF9561A2A7570A358787BD5C93C1C630FAFE9028459D1D9E4` | `E41189B9093457BDF9561A2A7570A358787BD5C93C1C630FAFE9028459D1D9E4` | UNCHANGED |
| `ml/models/multi_source_feature_schema.json` | `B6F63D3858AA31111495CD83DBC15349364A24EC58536EA419987666F8B6569C` | `B6F63D3858AA31111495CD83DBC15349364A24EC58536EA419987666F8B6569C` | UNCHANGED |
| `ml/models/multi_source_model_metadata.json` | `5BD9D23082231151C9AB9EDE4D9F351ECB4E33EDC8370EF52035F444465D94A8` | `5BD9D23082231151C9AB9EDE4D9F351ECB4E33EDC8370EF52035F444465D94A8` | UNCHANGED |

These hashes establish byte-level preservation only. Metadata records CERT r4.2 and a 21-feature schema, but its saved performance values were not reproduced here and are not proof of detection quality.

## Missing services and configuration

- **Root `.env.example`: absent**, while README setup says to copy it. Root `.env` and `.env.neon` exist; their values were not included in this report.
- **CERT data:** `ml/data/cert-r4.2/` is absent. No raw release files, release README or answer archive were found at that documented path. Real research data validation was out of scope and not attempted.
- **Production employee identity:** no configured external identity provider/employee session workflow was verified. Employee/manager password login remains disabled.
- **Mailjet:** mocks only; real provider account, verified sender and inbox delivery unverified.
- **Gemini:** optional advisory integration; no external call made.
- **City data/provider:** local and provider implementation is present, but actual deployment configuration/data and live provider call were not checked.
- **Production database state and migrations:** not inspected. Only isolated temporary test schemas were migrated.
- **Production endpoint deployment:** agent test integration passed locally; installed endpoint, assigned OS identity, network reachability and real employee collection were not inspected.

## Working-tree preservation

At the start of the prior follow-up, `HEAD` was `c933e3ca`; its 66-file commit contains the previously reported modified/untracked research, model-support, server and test work. Those files are present and tracked in `HEAD`; no evidence of missing prior edits was found. The current uncommitted work includes authorized fixes to `server/test/device-buttons.browser.test.js`, `client/src/pages/SimulatorPage.jsx`, `server/routes/simulation.js`, `server/openapi.json`, the new simulator API/browser tests, and this updated audit. No reset, clean, checkout or discard command was used. `git diff --check` passed.

## Final status summary

| Status | Modules |
|---|---|
| WORKING (verified in local tests) | Admin login/MFA/session controls; core authorization and tenant scoping; local agent enrollment/ingestion fixture; risk/trust/hold enforcement; guarded RF aggregate inference and failure handling; incident/policy persistence paths; API/SPA production source-server smoke; current-source Vite build. |
| PARTIALLY WORKING | Employee/device management; endpoint dashboard (current-source browser workflow verified against test fixtures; deployed employee activity remains unverified); dashboards and UI workflows not fully browser exercised; audit/export; settings; optional notification/geolocation/copilot; endpoint collection as an actual deployed service. |
| BROKEN (reproduced) | Development Vite client startup test timed out. |
| NOT IMPLEMENTED / dormant | Employee/manager console login and production gateway; live endpoint-to-RF feature construction; active ArchitecturePage/API explorer; separate ProfilePage route; `/api/system/routes` and `/api/cyber/*` routes. |
| BLOCKED / NOT VERIFIED | Real CERT data/evaluation; production DB migration status; external IdP, Mailjet delivery, Gemini and city provider; actual deployed employee/laptop end-to-end behavior. |

**Recommended next repair:** diagnose the development Vite startup test timeout. The custom simulator/API mismatch is resolved with a bounded simulation-only route, and the Devices browser regression is resolved in its test fixture. Keep the RF guard and employee-login restriction unchanged.
