# CYBERORBIT

React/Vite security console, Express/Prisma/PostgreSQL policy enforcement, Python Random Forest/SHAP inference, and a separate JavaScript endpoint agent. [OpenAPI](server/openapi.json) describes the active API; [research instructions](ml/research/README.md) explain reproducible comparisons.

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

Start/restart the existing Python ML terminal with:

```powershell
python -m pip install -r ml\requirements.txt
python -m uvicorn ml.src.app:app --host 127.0.0.1 --port 8000
```

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

1. Administrator: Employees → create an employee with department, manager and password; configure thresholds in Policies. Selecting the employee opens Security Profile without replacing the administrator's login identity.
2. Employee: log in, complete the actual one-time challenge, open Resources and request access. The backend derives identity and logical browser from the session. Access is checked before private resource data is returned.
3. Administrator: Simulator → choose a **demo employee** and a labelled scenario. Decisions, risk/trust history, incidents, requests and audits are persisted. A recent elevated assessment remains effective for 15 minutes; clean retries cannot bypass MFA/approval. Fresh MFA or an authorized approval satisfies the relevant requirement. Critical accounts are frozen and active sessions revoked.
4. Manager: review direct-report requests. High-risk/highly-sensitive requests require security administration; nobody may approve their own request. Administrator: investigate, add resolution notes and restore an account after review. Restoration invalidates old sessions; the employee signs in again. Application FREEZE does not lock Windows.
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
