# City estimates using existing employee agents

This change is only in the backend, database and dashboard. Existing Windows,
Linux and macOS kits, enrollment credentials, assigned identities and heartbeat
request/response contracts remain unchanged. No employee OS Location prompt,
GPS collection, browser geolocation call or local consent flag is required.

The backend estimates the city/region of the public network used by an
authenticated laptop heartbeat. It cannot establish an exact address, employee
physical presence or seat. VPNs, company gateways, mobile networks and IP
database errors can show another city. Treat the result as an estimate.

## Setup

1. Deploy the updated backend and frontend. Apply the additive migration and
   regenerate/build:

   ```sh
   npm run prisma:migrate
   npm run build
   ```

2. Configure these **backend-only** environment variables (also shown in
   `server/city.env.example`), then restart the server:

   ```text
   ENDPOINT_CITY_ENABLED=true
   IPAPI_API_KEY=<your ipapi.co production key>
   ```

   The production backend requires a key; do not put it in a Vite variable,
   employee kit, URL in the dashboard or Git. The provider is **ipapi.co**, not
   Google's Maps/Geolocation API. A Google key is not interchangeable.
   [Provider API documentation](https://ipapi.co/api/) describes explicit-IP
   requests. The provider's [current plan information](https://ipapi.co/#pricing)
   reserves its free trial for development/testing. Select an appropriate plan
   for a deployment; no subscription or charge is created by this code.

3. If hosting behind a proxy, configure the existing `TRUST_PROXY` with verified
   immediate proxy IPs. `server/server.js` supports explicit IPs or `loopback`;
   keep the configured trust limited to the actual deployment's proxy. Do not
   trust arbitrary `X-Forwarded-For` senders. Ask the hosting operator for the
   correct proxy addresses. A private/unavailable source address produces a
   clear status instead of locating the backend's egress IP.

4. Open **Devices → Installed endpoint agents**. Find the enrolled assigned
   laptop and click **Enable city estimate** under the company's disclosed
   monitoring policy. This per-device setting defaults off. The provider receives
   the heartbeat's public IP. The enabling/disabling administrator is audited.

5. Wait for the next authenticated heartbeat (normally about 30 seconds), then
   the dashboard refresh (about 15 seconds). The card shows estimated city,
   region/country, network observation time and IP database lookup time.
   Existing kits work immediately after server deployment: do not re-enroll,
   reinstall or edit employee source/config files.

## What is stored

Only the most recent city/region/country result, provider/source and lookup /
heartbeat observation timestamps are stored. The location record does not save
raw IP, coordinates, postcode, browser details or a travel history. The provider
may retain IP queries according to its own terms. Normal database backup
retention remains applicable.

The dashboard labels estimates older than five minutes or disconnected devices
as **Last known estimate; not current**. Results expire from API views at 24 hours
and are cleared by the existing one-minute retention job. Disabling city
estimates or revoking the device clears saved data immediately. Pausing monitoring
stops lookup and hides/clears the saved estimate. Resume gets a fresh heartbeat.

## Reliability and isolation

- Authentication, device/company/administrator scope and enrollment are checked
  before a lookup. The dashboard's own IP or a request-body IP cannot select the
  employee device location. Location is derived only on `/api/endpoint/heartbeat`.
- Existing agent config is untouched; location settings are independent database
  fields and are not sent in collector config to older agents.
- Provider failure or optional location-write failure does not revoke an agent
  credential or roll back an accepted heartbeat. Application/queue sync continues.
- Lookups use a fixed HTTPS host, explicit validated public IP, no redirects,
  a two-second timeout, a 64 KiB response limit and a bounded in-memory cache.
  Private, reserved and scoped addresses are excluded. Successful results are
  cached for five minutes; failures for one minute, maximum 512 cached IPs and
  60 uncached lookups/minute per server process. Coalescing shares pending work.
- A generation counter prevents delayed results overwriting newer heartbeats or
  restoring data after pause/resume, disable/re-enable or revocation. Frequent
  event uploads do not cancel an independent heartbeat location lookup.
- Company/admin assignment scopes match the existing endpoint dashboard. Device
  city views do not introduce employee login or broaden console access.

## Verify

```sh
npm run build
npm run test:city
```

Tests use synthetic provider responses, existing agent-shaped HTTP bodies,
isolated real PostgreSQL schemas and the production React bundle in Chrome.
They cover all three platform enrollments, unchanged collector config, trusted
proxy behavior, tenant isolation, failures, control races, expiry, timestamps and
stale/disabled views. They are not evidence of a real employee's physical city.

On the deployed backend, enable the provider and the specific enrolled device,
then confirm a new observation timestamp after a heartbeat. Test disable/pause
and confirm estimates clear. Check the actual device's egress network/VPN when
the estimate differs. No existing agent kit needs to be replaced.

## Verification in this workspace — 18 October 2026

- Production frontend build passed and the single additive migration was applied
  to the verified localhost development database. Hosted deployment/migration is
  still the deployment operator's step.
- All seven city tests passed: provider validation/cache/failures, real
  HTTP/PostgreSQL compatibility/races and the three-platform Chrome dashboard.
- Existing assignment, UUID-copy, macOS heartbeat/queue, core contract and release
  package checks passed. The usage regression was corrected to test personal
  filtering at the service layer while preserving administrator-only console
  authentication; that updated regression passed.
- A live development API probe used the public test address `8.8.8.8`, not an
  employee IP. The provider returned HTTP 429, and the implementation correctly
  reported `rate-limited`. No live employee city was verified. Configure a valid
  production key and verify on the deployed backend.
- `git diff -- agent` is empty. Existing Windows and install-kit ZIPs remain
  SHA-256 `41b6bfb5127e20927892a1c22728044eee584933d41b10b3896500c0f2347db3`;
  the Mac build ZIP remains
  `c66500fea0c7ea7c42099ad62395f6bba9a046d98ce9b4bb3294f8314c2ca1cf`.
