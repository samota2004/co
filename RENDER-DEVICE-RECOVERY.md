# Existing devices missing behind a migration error on Render

The screenshot's red database-migration error is a failed dashboard query, not a
successful empty list or evidence of deleted devices. The new city columns can
cause Prisma P2022 on the live database if the application is deployed before
`20261018120000_endpoint_city_estimate` is applied. API-provider keys do not fix a
database schema mismatch.

## Recover the existing deployment

Keep the existing Render backend service and its current `DATABASE_URL`. Do not
point it at the local development database, create a new database, seed/reset the
database, revoke credentials or re-enroll the employee laptops.

For the repository-root Render setup used by this project:

1. In the existing backend service's Settings, change **Build Command** to:

   ```sh
   npm ci && npm run prisma:migrate && npm run build
   ```

   These commands already exist in the city-feature commit. The new convenience
   command `npm ci && npm run build:render` performs the same deployment steps
   after publishing this fix. Keep **Start Command** as `npm start`.

2. Save and run **Manual Deploy → Clear build cache & deploy**. This rebuilds
   against the same database and runs the pending migration. See
   [Render's deploy command documentation](https://render.com/docs/deploys).

3. Confirm the deploy log applies `20261018120000_endpoint_city_estimate`, or
   reports that no migrations are pending, and that the backend starts normally.
   The city migration only adds three optional metadata columns with defaults.
   It does not delete device/event rows or change their enrollment credentials.

4. Refresh **Devices → Installed endpoint agents**. Existing device UUIDs,
   employee assignments and event history should resolve from the same database.
   A laptop offline during the outage may be OFFLINE/STALE until its next valid
   heartbeat. Agents are not replaced or re-enrolled.

If the migration fails, preserve the existing database and inspect the deploy
error. If the dashboard returns HTTP 200 with fewer devices after migration,
verify the signed-in administrator/company scope and that Render still points at
the original database. Record deletion cannot be inferred from a failed query.
Production row counts must be verified against that production database.

## Build stops with P1012: DATABASE_URL protocol

If `prisma migrate deploy` reports that the URL must start with `postgresql://`
or `postgres://`, validation failed before migrations ran. Correct the value in
the existing backend service's **Environment** settings. The key is
`DATABASE_URL`; its value must be the original production PostgreSQL connection
URL alone, with no surrounding quote characters, `DATABASE_URL=` prefix, `psql`
command, or leading/trailing whitespace. Preserve its host, database, credentials
and query parameters. Do not substitute a local URL or a new empty database.

The backend's `server/models/prisma.js` removes surrounding quote characters
before constructing its Prisma client, whereas the Prisma CLI reads the raw
environment variable. Thus an accidentally quoted Render value can explain why
the old backend connected but the migration command now fails. The log alone
does not prove which formatting mistake is present. Quotes used as syntax in a
local `.env` file are different from literal quotes in Render's value field.

Choose **Save, rebuild, and deploy** after correcting the existing value; keep
the migration build command above. See [Render's environment variable
instructions](https://render.com/docs/configure-environment-variables). Never
paste the connection URL into chat or expose it in screenshots. Verify the next
deploy reaches migration execution and then starts the backend before checking
the device dashboard. The npm audit summary and Prisma deprecation warning in
this log are separate from the P1012 failure.

## Code hardening included in this fix

- Core queries explicitly select the original endpoint columns. Enrollment,
  ingest, assignment and token issuance no longer implicitly select city fields.
- City schema readiness is checked separately. A missing optional city column
  disables just city estimates; existing devices, employees, events and
  authenticated heartbeats remain available. Optional errors retry outside the
  failed PostgreSQL transaction; unrelated schema/auth/database errors propagate.
- Legacy-schema assignment inserts omit the new Prisma client-side defaults
  while retaining validated employee/company scope and parameterized SQL.
- Pause/resume/revocation still work before the optional migration. City
  maintenance skips an unavailable city schema; browser-title retention remains.
- The dashboard labels city-only migration status and disables only its city
  toggle. An initial whole-dashboard error explains that the saved list failed
  to load; it does not show misleading "no observations" messages or invite
  assignment while the employee list is unavailable.

## Regression verification

`npm run test:city-migration` uses a disposable PostgreSQL schema, not employee
data. It enrolls two Windows devices and one Mac, removes the optional city
columns, and verifies their IDs, credential hashes, employee mappings, dashboard,
heartbeats, app events, new token exchange, controls and tenant isolation. It
then reapplies the real additive SQL and checks preservation again. A Chrome
test checks the three cards and honest error-state display.

Executed verification: 26 tests passed, zero failed or skipped, across the
migration/API/browser, city, device assignment/UUID, application usage, macOS
backend, agent core and existing Windows release checks. `npm run build:render`
also passed against the configured local database (10 migrations, none pending)
and generated the production frontend. Vite reported its existing large-chunk
warning. No employee kit was modified.

The configured local database already has the migration; the user's screenshot
was identified as the live Render website. Local tests do not establish that the
live Render deployment or its actual three records have recovered.
