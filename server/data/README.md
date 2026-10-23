# Local city data

DB-IP Lite City is a separate, explicitly selected provider (`IPAPI_PROVIDER=db-ip-lite`).
It needs no API key and sends no heartbeat IPs to a geolocation service. It uses
the same validated public IP and authenticated, scoped heartbeat flow as API mode.

The build downloads the October 2026 release pinned in `geoip-release.json` from
DB-IP's official HTTPS host, verifies its published compressed SHA-1 and MMDB
type/date, and records the expanded SHA-256. Runtime verifies that checksum and
loads one read-only buffer (approximately 121 MB plus reader/process overhead).
Generated data under `geoip/` is ignored by Git. Run `npm run city:prepare` with
local mode selected, or `node server/scripts/prepare-city-db.mjs --force` for tests.
Download failures stop a local-mode build; missing/corrupt data produces an honest
unavailable status at runtime. Previously installed kits need no update.

The dataset is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Required attribution: [IP Geolocation by DB-IP](https://db-ip.com).
The dashboard displays this link with each local result. No database contents
are modified; only city, first region, country and build date are extracted.

[DB-IP Lite](https://db-ip.com/db/lite.php) has reduced coverage/accuracy compared
with commercial data. VPN/gateway/anycast addresses can resolve elsewhere or have
no city. This is not proof of an employee's actual location.

DB-IP publishes monthly releases. Before updating, verify the new official
[City Lite release](https://db-ip.com/db/download/ip-to-city-lite), update both
the release/URL and published SHA-1 in the manifest, then rebuild and run city
tests. Refresh monthly; runtime rejects data older than 90 days. A stale pinned
release fails the build rather than silently displaying stale data. Check backend
RAM headroom before enabling local mode on a constrained host.
