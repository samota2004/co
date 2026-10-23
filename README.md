# CYBERORBIT

React/Vite security console, Express/Prisma/PostgreSQL policy enforcement, Python Random Forest/SHAP inference, and a separate JavaScript endpoint agent. [OpenAPI](server/openapi.json) describes the active API; [research instructions](ml/research/README.md) explain reproducible comparisons.

### Active risk and trust policy

The live backend scores observed context by taking the strongest factor in each category (time, resource, device, volume, authentication, privilege, transfer, location, history), summing those factors and capping at 100. The deployed RF output is **not independently calibrated**. Its saved operating threshold maps to the MFA boundary (60 by default), with a piecewise linear score from 0 to 100. The final current-event risk is the larger of contextual and model evidence, rounded and bounded to 0–100. This avoids summing correlated RF and context evidence; it is a policy heuristic, not a threat probability or scientifically optimized rule. A recent elevated assessment can hold a higher score for 15 minutes; the explanation records that hold. A missing model or unobserved device is missing coverage, not malicious evidence. The obsolete `mlWeight` setting is retained in stored policies for compatibility but has no effect.

Default actions are 0–39 allow/log, 40–59 monitor, 60–74 fresh MFA and alert, 75–89 reviewed approval, and 90–100 freeze if enabled (otherwise configured restriction). Company policy can customize boundaries. The protected-data access route binds the assessment to the authenticated principal; administrator scenario submissions use `/resources/test-access` and cannot return protected data. The server uses persisted user identity, role, resource sensitivity, current trust and incident state for every protected resource access. Trust is a separate history gate: below 60, sensitive resources require recent reviewed approval; below 30, other otherwise allowed access requires fresh MFA. An active frozen/disabled account or unresolved critical incident cannot be bypassed by trust or approval. Restricted/investigating status requires administrative review and restoration. Trust recovery is at most the configured increment per hour and requires an active account, no unresolved incident or elevated assessment in the last day, and assessed benign authorized resource access on three distinct prior UTC days **after the latest elevated assessment or incident review**, within the last seven days. Synthetic demo and scenario-test activity do not qualify. Recovery never deletes incidents, holds or audit history. The application records policy and trust changes in PostgreSQL audit logs; MFA and approvals require the configured application workflows and are not substitutes for an external enterprise identity provider. Employee console login is currently disabled, so employee access decisions are exercised through server-side evaluation and tests rather than a production employee session.

Automatic recovery additionally requires the current request to be a server-validated, same-principal protected-resource access within a five-minute clock tolerance. Backdated imports, administrator scenario submissions, synthetic events and unvalidated historical rows cannot trigger recovery. Because employee console login is disabled, automatic employee recovery is not reachable in production; an authorized review/restoration remains the available path until a real employee identity and resource gateway are integrated. The current trust thresholds are policy defaults, not empirically optimized values.

A reviewed approval can satisfy an approval risk gate, but cannot grant a resource role that the principal does not hold. Changing a person's role therefore does not make an old approval a role override.

## Render database updates and existing endpoint devices

Render must apply migrations as well as generate Prisma. For this repository-root
deployment, use Build Command `npm ci && npm run build:render` and keep Start
Command `npm start`. This applies the additive database updates before building.
For the existing deployed city-feature commit, the equivalent command is
`npm ci && npm run prisma:migrate && npm run build`. Keep the existing production
database URL and device enrollments. Follow [existing-device recovery](RENDER-DEVICE-RECOVERY.md)
if the dashboard displays a database migration error instead of the saved list.

## Assigned administrator access

In **Employee monitoring → Add/Edit Employee**, select a manager when adding an employee, or an administrator when adding a manager. Both selections are required. Employees inherit their manager's administrator automatically. Moving a manager to another administrator also moves their employees. The main administrator can assign or move anyone within the company. A regular administrator can create people under their own account and can manage only their assigned people. Employee and manager activity, endpoint devices, incidents, risk data, audit entries and live updates follow that assignment. The main administrator sees the whole company.

The additive `assignedAdminId` migration leaves existing staff unassigned. Only the main administrator can see those records until assigning them. Historical activity stays with its employee and becomes visible to the new administrator after reassignment. Restart the backend after applying migrations and regenerating Prisma. The Windows agent and its enrollment do not need changing for this access rule.

## Existing Windows installation: load this update

These changes are additive. Keep the installed agent, enrollment, credential vault and encrypted queue. Do **not** reinstall or revoke the device to update the website.

From `C:\Users\priya\OneDrive\Desktop\capstone`:

```powershell
npm ci
npm --prefix client ci
npm run prisma:generate
npm run prisma:migrate
npm run build
```

After migrations, restart your **existing** VS Code backend terminal: Ctrl+C, then `npm start` from `server\`. Do not open a second backend on port 3000. The existing separate frontend continues with `npm --prefix client run dev` on 5173. Alternatively, `npm run dev` from the root serves API and frontend together on 3000; use one of these backend entry points.


For local endpoint enrollment, explicitly set `ENDPOINT_ALLOW_LOOPBACK_HTTP=true` in `.env`. For local MFA without sending email, explicitly set `DEV_MFA_MODE=true`; codes are returned only to loopback clients outside production, never logged. These exceptions do not work in production. Normal email delivery uses the Mailjet HTTPS API; configure the four MAILJET variables described below. `SECURITY_TIMEZONE` controls office-hour comparisons; daily baseline and research windows remain UTC.

Start/restart the Python inference service from the project root with:

```powershell
npm run ml:serve
```

For a fresh Python environment only, install its declared packages once with `python -m pip install -r ml\requirements.txt`.

Both Node and Python resolve `CYBERORBIT_MODEL_DIR` from the project root when it is relative, or use an absolute path unchanged; either process environment or the root `.env` can set it. Keep the active model, feature schema and metadata together in that directory. The service health check compares the live model/schema/metadata fingerprint, feature count and threshold with the backend configuration before reporting healthy.

The active 21-feature user-day model is retained. Endpoint metadata cannot provide every required email, content or URL feature. Its timeline therefore remains visible with ML assessment explicitly unavailable; no missing features are filled with zeros.

## Fresh setup and opt-in demonstration

Install Node 24, Python 3.13 and PostgreSQL. Copy `.env.example` to `.env`, configure PostgreSQL, a random JWT secret and SMTP or explicit local development MFA. Never replace an existing `.env` with sample values. Run the commands above.

For a new company only, set `COMPANY_ID`, `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD` (12–128 characters), then `npm run seed`. Existing main administrators, passwords, risk history and device credentials are preserved. This also creates the supported department/role catalog and a default company policy when absent.

For the separate **synthetic** `cyberorbit-demo` tenant, configure `DEMO_PASSWORD` (12+ characters), then:

```powershell
npm run seed -- --demo
```

This creates 100 explicitly named synthetic employees, 10 managers, resources and labelled prior activity; it is idempotent. Sign in with `soc@demo.cyberorbit.invalid` and your configured password using local development MFA. These accounts cannot receive SMTP mail at `.invalid`. Synthetic events are test/demo inputs, never evidence of real employee behavior or CERT performance.

## Verify the workflow

1. Administrator: Employees → create a monitoring identity with department and manager; configure thresholds in Policies. Employee passwords are deliberately rejected by the current API. Selecting an employee opens Security Profile without replacing the administrator's login identity.
2. Administrator: use a verified MFA session to access a protected resource assigned to that principal. `/resources/:id/access` derives identity from the server-validated session and returns private data only after an allowed decision. Employee login and a production employee resource gateway are not implemented.
3. Administrator: Simulator → choose a **demo employee** and a labelled scenario. Decisions, risk/trust history, incidents, requests and audits are persisted. A recent elevated assessment remains effective for 15 minutes; clean retries cannot bypass MFA/approval. Fresh MFA or an authorized approval satisfies the relevant requirement. Critical accounts are frozen and active sessions revoked.
4. Administrator: review access requests, investigate, add resolution notes and restore an account after review. The manager review route exists but manager console login is disabled. Restoration invalidates old sessions. Application FREEZE does not lock Windows.
5. Devices: existing assignment/enrollment/usage filters remain supported. Logical Trust/Untrust/Revoke uses the real posture endpoint. OS endpoint enrollment has its own separate device credential and revocation control.

```powershell
npm run test:security
npm run test:api
npm run test:browser
npm run test:devices
npm run test:startup
npm run agent:test
python -m unittest discover -s ml/test -v
```

PostgreSQL tests create and delete only random test schemas. Browser tests use an isolated Chrome profile and temporary listener; they do not mutate production employees or restart the installed service. The test database role needs permission to create/drop schemas. `CYBERORBIT_TEST_BROWSER` can point to a compatible Chrome executable.

## Windows endpoint packaging

The existing runtime-inclusive package and instructions are preserved:

```powershell
npm run agent:build:windows
# For a NEW unenrolled laptop only, in elevated Windows PowerShell:
Set-Location .\agent\dist\install-kit
.\packaging\windows\install.ps1 -ServerUrl "http://127.0.0.1:3000" -AllowLoopbackHttp
# Production: trusted HTTPS, no -AllowLoopbackHttp.
```

Enter a fresh enrollment token at the hidden prompt. Do not put tokens on the command line. [Agent documentation](agent/README.md) covers verified SID mapping, approved collectors, startup, uninstall, scoped PowerShell policy, safe in-place updates and revocation. An already enrolled agent requires no change for this master-prompt update. Windows reboot acceptance, signed production distribution, Linux and macOS native acceptance are separately identified there.

## Deployment

Deploy the frontend, backend, PostgreSQL and ML service manually using your hosting configuration. Configure HTTPS and the backend environment variables for production.

Gemini remains optional: local rule summaries work without an external request. For an approved integration, set `GEMINI_ENABLED=true`, `GEMINI_API_KEY` and `GEMINI_MODEL` on the backend. Never put the key in frontend environment variables.

Audits are application append-oriented, company scoped and not editable through employee APIs; PostgreSQL administrators can still change storage. Central tamper-evident archival, enterprise SSO, hardware MFA, large-scale workers, external resource gateways and licensed CERT preprocessing provenance require additional production integration. Optional RL is not trained or claimed.


## Mailjet email delivery on Render

The existing Node backend sends OTP and password-reset emails through Mailjet Send API v3.1 over HTTPS. No frontend credentials or SMTP connection is used. `sendOtpEmail` and `sendPasswordResetEmail` retain their existing interfaces and templates. Provider acceptance is not proof of inbox delivery. No invitation/activation email endpoint currently exists; administrators created through Admin Management receive OTPs when they log in.

Keep Render build `npm ci && npm run build` and start `npm start`, Neon `DATABASE_URL`, Prisma migrations, JWT secrets, origins and proxy settings unchanged. No migration or reseeding is needed for this email change.

1. In Mailjet, obtain the API key and secret, and verify/activate the sender address under that same key. Complete any Mailjet account sending approval required for your account. Verify a domain and configure its authentication records when available.
2. In Render, select the existing **cyberorbit-backend** web service, then **Environment**. Add `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAILJET_FROM_EMAIL` (the verified address), and `MAILJET_FROM_NAME=CyberOrbit Security`. Keep `APP_URL=https://cyberorbit-backend.onrender.com` for reset links, `NODE_ENV=production`, and `DEV_MFA_MODE=false`. These are backend secrets; never use VITE-prefixed keys. Do not paste secrets into Git or logs.
3. Save without deploying if that option is available. Coordinate environment changes with the separately approved code deployment; this task does not push or deploy. The new code needs Mailjet configuration before it can send emails.
4. After deployment approval, verify main-admin and second-admin OTPs, resend, and password reset using approved real recipients. Check both Mailjet delivery status and the inbox. No live emails were sent by the automated tests.
5. Only after successful live verification, manually remove `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from Render. Local existing secret files are not edited by this migration.

Mailjet errors and ambiguous timeouts fail closed with safe messages. A failed OTP send marks its challenge FAILED and cannot create a session. A failed reset send invalidates that specific reset token. OTPs keep their five-minute expiry, five-attempt limit and 30-second resend cooldown; password reset keeps its 15-minute expiry and one-time use. Production ignores the existing explicit local development MFA option.

Local verification (run database tests only against a designated test database; each creates and cleans an isolated random schema):

```powershell
node --test --test-isolation=none server/test/mailjet-email.test.js
node --test --test-isolation=none server/test/mailjet-auth.test.js
node --test --test-isolation=none server/test/admin-only-login.test.js
npm run build
```

The Mailjet tests replace external HTTP calls with mocks and never send real emails. The auth test deliberately sets development MFA mode inside its test process while using production mode to confirm no OTP bypass is exposed. `.env.example` contains placeholders only. Mailjet account restrictions, sender verification, quota, suppression and recipient spam filtering still affect actual delivery.

API reference: https://dev.mailjet.com/docs/email-api/send-api-v31/send-basic-email
