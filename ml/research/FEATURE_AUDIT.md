# Feature and observation-time audit (updated 2026-10-23)

This is a code/schema audit, not a certification of the saved model's original training data. The `Capstone.ipynb` training cells and saved schema both declare 21 user-day inputs in the same order. `raw_user_day.py` now implements the notebook formulas for all 21 from the notebook-declared columns. The official r4.2 release files and README are absent, so source headers, values, time zone, and duplicate behavior have not been validated against the real release. Staging rejects duplicate event IDs whereas notebook training retained rows; a real run with duplicates must be investigated rather than assumed equivalent. The seven contextual research fields have no verified CERT source mapping. The active risk engine uses separate live request context.

The earliest possible availability of a completed user-day is **23:59:59 UTC on that date**. A completed day cannot be used for an earlier decision. Real prepared rows declare both `feature_available_at` and `decision_at`; the runner requires availability at or after day end and no later than the decision. For an online resource request, only events observed through the request instant may be used. These declarations are not proof that upstream events actually arrived on time.

| Feature | Candidate source and rule | Availability / leakage finding | Action |
| --- | --- | --- | --- |
| `logon_count` | Notebook: count `logon.csv` rows per `(user,date)` | Day end; user identity is grouping key | Formula implemented; validate release header |
| `device_event_count` | Notebook: count `device.csv` rows | Day end; device connection is not transfer | Formula implemented; do not infer exfiltration |
| `file_event_count` | Notebook: count `file.csv` rows | Day end; activity meaning varies by release | Formula implemented; validate release semantics |
| `http_event_count` | Notebook: count `http.csv` rows | Day end; URLs can be sensitive | Formula implemented; raw URL is not model output |
| `email_event_count` | Notebook: count `email.csv` rows | Day end; recipient/content sensitivity | Formula implemented; validate release header |
| `day_of_week` | Notebook: pandas weekday from date, Monday=0 | Known at day start; date proxy possible | Implemented as Python weekday; staging treats parsed dates as UTC |
| `is_weekend` | Notebook: weekday in `{5,6}` | Known at day start; date proxy possible | Implemented from Monday-zero weekday |
| `logon_unique_pc_count` | Notebook: distinct `logon.csv.pc` | Day end; identity/device proxy | Implemented as count; raw PC ID excluded |
| `device_unique_pc_count` | Notebook: distinct `device.csv.pc` | Day end; identity/device proxy | Implemented as count; raw PC ID excluded |
| `file_unique_pc_count` | Notebook: distinct `file.csv.pc` | Day end; identity/device proxy | Implemented as count; raw PC ID excluded |
| `http_unique_pc_count` | Notebook: distinct `http.csv.pc` | Day end; identity/device proxy | Implemented as count; raw PC ID excluded |
| `email_unique_pc_count` | Notebook: distinct `email.csv.pc` | Day end; identity/device proxy | Implemented as count; raw PC ID excluded |
| `unique_files` | Notebook: distinct `file.csv.filename` per day | Day end; path can proxy user/scenario | Implemented as count only; raw filenames not output |
| `file_content_events` | Notebook training cells: `file.csv.content` non-null row count per user/day | Day end; content may encode scenario | Implemented with pandas default CSV NA tokens; test fixture parity only; verify against actual release parser |
| `unique_urls` | Notebook: distinct `http.csv.url` per user/day | Day end; URL can proxy scenario | Implemented; source values are not emitted |
| `unique_http_content` | Notebook: distinct `http.csv.content` per user/day | Day end; content may encode scenario | Implemented with pandas default CSV NA tokens; verify against actual release parser |
| `unique_recipients` | Notebook: distinct `email.csv.to` per user/day; `cc`/`bcc` not included | Day end; recipient can proxy scenario | Implemented exactly as code; verify release column semantics |
| `email_size_total` | Notebook: sum of `email.csv.size` per user/day | Day end; no post-event data needed in principle | Implemented with blank values as zero and invalid/negative values rejected; units unverified |
| `attachments_total` | Notebook: sum of `email.csv.attachments` per user/day | Day end; may proxy scenario | Implemented with blank values as zero and invalid/negative values rejected; encoding unverified |
| `total_activity` | Notebook: sum of the five source event counts | Day end | Implemented; difference only if staging rejects duplicate rows |
| `cross_source_activity` | Notebook: number of five source counts greater than zero | Day end | Implemented; difference only if staging rejects duplicate rows |
| `device_trust` | Verified logical-device state at cutoff | Dynamic state may reflect later investigation | Unresolved for CERT; snapshot as-of cutoff only |
| `cross_department` | Employee/resource department mismatch at request | Needs contemporaneous role/resource mapping | Unresolved for CERT; do not infer from future LDAP |
| `is_off_hours` | Current hour vs prior-only baseline or fixed policy | Prior baseline may leak future days if fit globally | Use prior-only baseline; original mapping unresolved |
| `failed_logins` | Prior observed auth failures in declared window | Window must end by cutoff | Unresolved for CERT; document window |
| `download_volume_mb` | Observed transferred bytes converted to MB | File read/write does not prove transfer volume | Unresolved for CERT; do not fabricate bytes |
| `resource_sensitivity` | Resource classification at request | Could be set after incident | Unresolved for CERT; time-versioned catalog needed |
| `unusual_location` | Current location vs prior-only baseline | Could leak future observations | Unresolved for CERT; prior-only fit required |

The live `RiskEngine` also reads device trust/status, resource department, observed failure count, explicit USB transfer, privilege event type, location, download volume, prior unresolved incident count and a prior-day UEBA baseline. The server derives resource, device, persisted trust, approvals and incident holds from the database. Some telemetry routes accept administrator-supplied observations, so those values are **not independently attested sensor evidence**. The protected resource route binds the subject and resource to the authenticated server session and ignores client scores/role/approval. The current RF wire key `threat_probability` is a legacy name for an **uncalibrated positive-class RF score**. The `mlPrediction.anomalyScore` database field also stores this score for historical schema compatibility; it is not an Isolation Forest result.

Automated checks reject unknown prepared-data columns, forbidden target/outcome names in the selected feature list, duplicate user-days, nonmonotonic day ordering, future declared availability, malformed values, and split overlap appropriate to the split strategy. Suspiciously disjoint univariate values are warnings for human review. These checks cannot detect a mislabeled raw source, cross-feature shortcuts, delayed event arrival, identity proxies in counts, or a manually falsified `feature_available_at` declaration. Source-by-source verification remains blocked until the official release README, raw logs and authorized answer key are present.

The provisional stage now accepts only a complete, separately prepared binary `user_id,date,label` map. It rejects missing/extra days and duplicate keys; it does **not** convert the unavailable CERT answer archive or certify the mapping. The experiment's optional combined future/unseen split excludes all other user-date cells and records them explicitly. Calibration verifies the original split manifest checksum before consuming labels, preventing a later reassignment of test rows into its calibration partition.
