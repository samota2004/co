# CERT model and live endpoint feature coverage

Audit date: 2026-11-04. This is an implementation/data audit, not evidence that the saved model is validated for current employee telemetry.

## Contract and training evidence

The checked schema is `ml/models/multi_source_feature_schema.json`, ordered as below. Every input is numeric and finite/nonnegative. Counts and distinct counts are integer-valued; `day_of_week` is Monday=0 through Sunday=6; `is_weekend` is 0/1 and derived from that day; `email_size_total` and `attachments_total` are numeric sums. The model accepts exactly 21 named features, in schema order, and no missing, extra, boolean, string, NaN, infinite, or negative values.

The inspected notebook (`ml/research/Capstone.ipynb`, cells 29–35) builds user-day rows from `logon`, `device`, `file`, `http`, and `email` tables. It outer-joins counts and fills join gaps with zero; numeric merged columns are also filled with zero. For a fully observed family, counts are row counts, PC features are distinct `pc`, file and URL/content/recipient features are `nunique`/`count`, email totals are sums, `total_activity` sums five counts, and `cross_source_activity` counts nonempty families. The raw saved-model inference path has no fitted scaler, encoder, or imputer; it consumes the numeric values directly. The preprocessing used to create the original notebook tables is not included as a runnable, pinned training pipeline. Training therefore cannot be reproduced from the model artifact alone.

Notebook split: rows sorted by `day`, first 70% train, next 15% validation, final 15% test. It is chronological by row, not employee-disjoint. A validation sweep chooses threshold by F1. Notebook RF parameters: 150 trees, max depth 14, min split 6, min leaf 2, balanced classes, seed 42. Saved threshold is 0.85. The checked metadata reports 231,316/49,568/49,568 rows and 284/149 validation/test threats. Reported test precision 0.5070, recall 0.2416, F1 0.3273, FPR 0.000708, ROC AUC 0.9670, PR AUC 0.3508; confusion counts TP=36, FP=35, TN=49,384, FN=113. These are saved claims, not independently reproduced: the original raw CERT files, release README, and authorized answer-key archive are absent. `ml/data/` is absent. The PR metric is average precision despite its legacy `PR_AUC` label. Do not treat the score as a calibrated probability.

No official CERT transformation can be confirmed beyond the notebook code because the dataset release and its source/time semantics were not available. The staging parser in `ml/research/raw_user_day.py` is explicitly provisional and `model_ready=false`; its timestamp, duplicate, and source-header assumptions need comparison to the official release.

## Feature coverage matrix

Status terms: **Fully supported** means source semantics and calculation match the notebook and have evidence; **Partially supported** means an adjacent endpoint observation exists but is not equivalent; **Unsupported** means no source exists; **Requires external integration** means a source such as an authorized enterprise audit API is needed; **Requires historical data** means date/prior observation input is needed. No Windows or macOS endpoint event is counted as a CERT source row.

| # | Model feature and notebook calculation | Windows endpoint | macOS endpoint | Backend / history | Status for endpoint RF |
|---:|---|---|---|---|---|
| 1 | `logon_count`: logon rows per user-day | Session login/logout observations; not CERT authentication rows | `who` session observations; not CERT authentication rows | No compatible auth source; historical source required | Requires external integration |
| 2 | `device_event_count`: device rows | USB inventory/attach observations; not CERT device activity | `system_profiler` USB inventory; not CERT device activity | No compatible device activity feed | Partially supported |
| 3 | `file_event_count`: file rows | Approved-root `FILE_CHANGE`; not file reads or CERT rows | Approved-root `FILE_CHANGE`; not file reads or CERT rows | Cannot infer notebook event rows | Partially supported |
| 4 | `http_event_count`: HTTP rows | Network connection metadata; not HTTP history | Established TCP connection metadata; not HTTP history | No URL/request audit integration | Requires external integration |
| 5 | `email_event_count`: email rows | No email collector | No email collector | No mail audit integration | Requires external integration |
| 6 | `day_of_week`: user-day date, pandas weekday | Derivable only from declared day | Derivable only from declared day | UTC calendar derivation exists; complete day must close | Requires historical data |
| 7 | `is_weekend`: weekday is 5 or 6 | Same as above | Same as above | UTC calendar derivation exists | Requires historical data |
| 8 | `logon_unique_pc_count`: distinct logon `pc` | Device identity exists, but compatible logon rows do not | Device identity exists, but compatible logon rows do not | No compatible source rows | Requires external integration |
| 9 | `device_unique_pc_count`: distinct device `pc` | USB event device is not source `pc` | USB event device is not source `pc` | No compatible source rows | Partially supported |
| 10 | `file_unique_pc_count`: distinct file `pc` | File change device is not CERT source `pc` | File change device is not CERT source `pc` | No compatible source rows | Partially supported |
| 11 | `http_unique_pc_count`: distinct HTTP `pc` | Connections lack HTTP source identity | Connections lack HTTP source identity | No compatible source rows | Requires external integration |
| 12 | `email_unique_pc_count`: distinct email `pc` | No source | No source | No mail audit integration | Requires external integration |
| 13 | `unique_files`: distinct `file.filename` | File-change relative path is not the training filename semantics | Same | No read/content semantics and no approved CERT mapping | Partially supported |
| 14 | `file_content_events`: non-null file `content` rows | No file content collection (correctly) | No file content collection (correctly) | No authorized source; never infer from change | Requires external integration |
| 15 | `unique_urls`: distinct HTTP `url` | No verified URL history | No verified URL history | TCP endpoint/address is not URL | Requires external integration |
| 16 | `unique_http_content`: distinct non-null HTTP `content` | Not collected | Not collected | No content source; privacy review required | Requires external integration |
| 17 | `unique_recipients`: distinct email `to` | Not collected | Not collected | No mail audit integration | Requires external integration |
| 18 | `email_size_total`: sum email `size` | Not collected | Not collected | No mail audit integration; units unverified | Requires external integration |
| 19 | `attachments_total`: sum email `attachments` | Not collected | Not collected | No mail audit integration | Requires external integration |
| 20 | `total_activity`: sum five source row counts | Endpoint event count is a different population | Endpoint event count is a different population | Cannot calculate compatibly without all source families | Requires historical data |
| 21 | `cross_source_activity`: number of source counts > 0 | No compatible source-family counts | No compatible source-family counts | Cannot calculate compatibly without all source families | Requires historical data |

**Compatibility result:** 0/21 features have a verified live endpoint source. Two calendar values are derivable from a declared date, but date derivation is not a complete user-day or a compatible observed source. The other 19 are unavailable. OS permissions do not solve the missing email/web-audit integration or semantic mismatch. Windows and macOS collectors do not gather email content, HTTP content, or file contents.

## Safe inference and implementation

- Endpoint dashboard readiness is diagnostic only; it reports no RF inference from current endpoint observations.
- `/api/telemetry/ingest` rejects generic events before aggregation, persistence, or inference.
- `/api/ml/predict` is a guarded administrator-supplied complete prior-UTC-day aggregate path. It is not a live endpoint inference path. Its feature object must be exact and internally consistent: five counts sum to `total_activity`; nonempty family count equals `cross_source_activity`; distinct/count fields cannot exceed their source counts; calendar fields must agree. Missing fields are enumerated and never zero-filled.
- Python and Node inference report the model fingerprint, feature-schema fingerprint, feature count, aggregation level and external-aggregate provenance. A service/schema mismatch fails closed. Prediction provenance means “an authorized caller supplied a complete aggregate”; it is not independent attestation that the caller's source data is correct.
- Model, feature order, saved metadata and reported metrics remain unchanged. No endpoint-native model is trained: no real endpoint training population, defensible labels, or time/user leakage-reviewed evaluation dataset is present. Synthetic fixtures are plumbing tests only.
- Application risk and device trust remain separate from endpoint ML availability. ML absence is not converted into a zero score or benign prediction.

## Endpoint-native model feasibility

Not currently feasible to evaluate credibly. Persisted endpoint telemetry contains application/process/session/USB/file-change/network observations but no validated ground-truth threat labels or representative longitudinal training set. A separate endpoint model requires an explicitly approved minimized feature schema, stable user-day identities and windows, labels from independently adjudicated incidents, split by time and preferably employee, leakage review, baseline comparison, calibration review, and reproducible held-out metrics (precision, recall, F1, FPR and confusion matrix). Do not activate a synthetic-only model or compare its metrics to CERT as if comparable.

## FREEZE is separate from model availability

FREEZE is a policy/account-control workflow, not an ML prediction. Server-side account status/session revocation can complete while per-device OS account enforcement is still pending. The endpoint enforcement record is only successful after the agent reports an OS result; pending, unsupported, and failed results must remain distinct. Do not describe a server `FROZEN` status alone as proof that Windows/macOS disabled the local account. A privileged local administrator can control the endpoint; managed deployment and locally approved account-control capabilities remain necessary.

## External integrations needed for full CERT compatibility

Obtain lawful, documented source feeds for actual authentication, device activity, file events matching the reviewed training definition, HTTP request/URL/content if specifically approved, and mail activity/metadata if approved. Each feed needs source-issued event IDs, authenticated tenant and employee mapping, event timestamps and time zone, retention/consent scope, schema version, deduplication rules, and historical data. Review the original CERT release README and label archive separately before asserting training parity. A new endpoint-native model is a separate project and must not replace the preserved CERT artifact without independently reviewed evaluation and release approval.
