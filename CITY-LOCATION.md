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

If the live Devices page shows a migration error instead of previously enrolled
laptops, follow [Render device recovery](RENDER-DEVICE-RECOVERY.md). A failed
dashboard query is not an empty database. This fix also keeps core monitoring
available when only the optional city schema is pending.

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
   IPAPI_PROVIDER=ipapi.is
   IPAPI_API_KEY=<your ipapi.is account key>
   ```

   `IPAPI_PROVIDER` must match the key's issuer. Supported values are **ipapi.is**
   and **ipapi.co**; the default remains `ipapi.co` for existing deployments.
   For an existing ipapi.co production subscription, set `IPAPI_PROVIDER=ipapi.co`
   and use that provider's key. Keys from the two services are not interchangeable.
   Google Maps keys are not supported. No automatic provider fallback takes place.

   The production backend requires a key. ipapi.is requires an account key in all
   environments; the anonymous tier is not used. Keep keys out of Vite variables,
   employee kits, dashboard URLs and Git. [ipapi.is API
   documentation](https://ipapi.is/developers.html) documents explicit-IP requests
   and a single-IP HTTPS POST, which this integration uses to keep the key out of
   the request URL. Its [terms](https://ipapi.is/terms.html) describe the account
   free tier and limits. [ipapi.co API documentation](https://ipapi.co/api/)
   documents that provider's separate endpoint and response. No subscription,
   account or charge is created by this code.

3. Configure the backend's ingress proxy policy. For a **Render public web
   service**, after deploying the proxy-policy update, set:

   ```text
   TRUST_PROXY=render
   ```

   This is an explicit opt-in, accepted only with Render's own `RENDER=true` and
   `RENDER_SERVICE_TYPE=web` environment. Do not add or fake those platform
   variables on another host. The preset trusts Render's private/local ingress
   and Cloudflare's published IPv4/IPv6 proxy ranges. It assumes private ingress
   is controlled by the service operator, with no untrusted clients connecting
   directly over that network. For other network topologies, use only verified
   explicit proxy IPs/CIDRs instead. The existing `loopback` setting continues
   to work for a same-host proxy; by itself it does not cover a chain containing
   Render's other private hops.

   Express walks the chain from the socket right to left, stopping at the first
   untrusted peer. Forged leftmost addresses, request-body IPs, `True-Client-IP`
   and `CF-Connecting-IP` are not used to override that result. Trust-all
   settings and numeric hop counts are rejected. A selected address that still
   belongs to a trusted public proxy is not geolocated as the employee laptop.
   With no policy configured the application remains in direct-connection mode.

   Sources: [Render ingress and client IP
   guidance](https://render.com/articles/how-render-handles-ddos-attacks),
   [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/), and
   [Cloudflare proxy ranges](https://www.cloudflare.com/ips/). The bundled
   Cloudflare list was checked 19 October 2026 and must be reviewed when the
   provider changes its ranges; it is not silently fetched on each request.

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
- Lookups use a fixed allowlisted HTTPS host for the explicitly selected provider,
  an explicit validated public IP, no redirects, a five-second timeout, a 64 KiB
  response limit and a bounded in-memory cache.
  Private, reserved and scoped addresses are excluded. Successful results are
  cached for five minutes; failures for one minute, maximum 512 cached IPs and
  60 uncached lookups/minute per server process. Authentication/refusal and quota
  errors pause all lookups for that configuration for at least five minutes,
  respecting a longer `Retry-After` up to 24 hours. A provider/key change clears
  the prior cache/cooldown; delayed old results cannot overwrite the new cache.
  Coalescing shares pending work. There is no retry through another provider.
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

### Connected device says "Public laptop IP unavailable"

This means the authenticated heartbeat was accepted, but a public client address
could not be resolved for the lookup. It does not require re-enrollment. A common
Render cause is `TRUST_PROXY=loopback`: the first proxy is accepted, but Express
stops at a further private hop. Deploy this update and change only that backend
setting to `TRUST_PROXY=render`, then **Save, rebuild, and deploy**. Keep the
existing database, enrollment credentials, city opt-in and provider key.

The startup log should show `[trusted-proxy-policy]` with `mode: "render"`.
Wait for a new heartbeat (normally 30 seconds) and dashboard refresh (normally
15 seconds). Verify a new city observation timestamp on the assigned device.
If the status changes to a provider error, address resolution has progressed but
the provider/key/rate limit needs separate verification.

For an unresolved address, `[endpoint-city-ip]` logs at most one safe diagnostic
per minute after an authenticated, opted-in heartbeat. It records only policy,
public/non-public/invalid address classes, bounded hop counts and header status.
It does not log employee IPs, raw headers, credentials, keys or device IDs.
Share that diagnostic if the public-IP error persists after redeployment; an
unknown ingress topology needs verified proxy ranges rather than trust-all.

Regression command: `npm run test:proxy`. It covers actual Express chain
resolution, IPv4/IPv6, forged prefixes, untrusted peers, missing/invalid chains,
proxy-only chains, redacted diagnostics and unchanged agent HTTP heartbeats
which transition from the private-IP error to a stored dashboard city. Provider
responses and network peers are synthetic; real Render recovery must still be
verified after deployment.

Executed for the proxy update: **31 passed, zero failed/skipped**, including
proxy-policy security, city unit/API/browser, pending migration compatibility,
server startup/production serving, HTTP security, enrollment, application usage,
macOS backend, agent core and Windows release checks. No kit files changed.

### Connected device says "Location API unavailable"

This is different from the public-IP/proxy error: a lookup was attempted but no
usable provider response was obtained. One confirmed configuration problem was
an **ipapi.is key used by the old ipapi.co-only integration**. After deploying
the provider update, set `IPAPI_PROVIDER=ipapi.is` in Render's backend Environment,
keep the corresponding key in `IPAPI_API_KEY`, and **Save, rebuild, and deploy**.
Keep `TRUST_PROXY=render`, `ENDPOINT_CITY_ENABLED=true`, the device's city setting
and its existing enrollment. Do not replace the database or employee kits.

The card now shows the configured provider, the actual last-result provider if
different, and actionable authentication/quota/timeout/network/response errors.
`[endpoint-city-provider]` logs contain only the provider, safe status/reason and
HTTP status, at most once per minute. They never contain the API key, query URL,
employee IP, raw provider error/body or account details. A provider response for
a different IP is discarded. Only city, state/region, country and timestamps
are extracted from ipapi.is; coordinates, postcode and other returned fields
are excluded. An actual city and fresh observation timestamp on the live
dashboard are still required to confirm recovery.

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
