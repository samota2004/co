# CYBERORBIT endpoint ML model report

Assessment date: 2026-11-04. This report distinguishes the preserved CERT model from the experimental endpoint-native research path.

## Decision

**No endpoint-native model is trained, promoted, or used for live predictions.** The repository has no verified real endpoint training population and no independently adjudicated employee-day threat labels. The checked-in experiment output is a synthetic plumbing smoke run. It is not production telemetry and its metrics must not be used as accuracy claims.

The production/research CERT Random Forest remains a separate artifact with its exact 21-feature user-day schema. Live endpoint readiness is `INSUFFICIENT_FOR_MODEL`, 0/21 compatible features. The authorized complete aggregate route remains guarded; it does not derive CERT rows from endpoint telemetry.

## Current evidence

| Item | Evidence and status |
| --- | --- |
| Preserved artifact | `ml/models/multi_source_ueba_rf.joblib`; SHA-256 is recorded at completion time in the completion report. No training or replacement occurred in this task. |
| Model contract | `ml/models/multi_source_feature_schema.json`; 21 ordered numeric CERT features; user-day aggregation. |
| Saved metadata | `ml/models/multi_source_model_metadata.json`; 231,316 train / 49,568 validation / 49,568 test rows and recorded metrics. These are saved metadata claims, not independently reproduced here. |
| Original dataset and answer key | Not present under `ml/data/`; missing, so label mapping and original evaluation cannot be independently verified. |
| Endpoint-native dataset | No reviewed, labeled endpoint dataset is present. Repository smoke fixture/results are explicitly synthetic. No real sample count or label count is asserted. |
| Production endpoint RF | Not trained, not activated, and no employee endpoint prediction is available from the current endpoint event stream. |
| Pipeline | `ml/research/experiment.py` is a separate, provenance-gated research trainer. It accepts reviewed user-day CSVs, enforces timestamps/schema/splits, selects threshold on validation only, writes artifacts to a new output directory, and records source/split hashes. This pipeline is not a production trainer and does not itself establish labels or feature provenance. |

The notebook records a chronological 70/15/15 row split. The separate research experiment runner supports chronological 60/20/20, employee-disjoint, and future-unseen-employee strategies. Neither should be confused with the other. Current metadata reports precision 0.5070, recall 0.2416, F1 0.3273, FPR 0.000708, and confusion counts TP=36, FP=35, TN=49,384, FN=113. They are not reproduced without the original source files and answer archive. `PR_AUC` in the saved metadata is average precision.

## Endpoint-native feature and label readiness

Current collectors provide application/process/session/health/network/USB and file-change observations with platform-specific gaps. These are not automatically labels or equivalent CERT sources. Candidate features may be studied only after a versioned contract defines event source, user/device mapping, UTC window, completeness, permission state, deduplication, and availability time. Suitable candidates must be based on verified observations such as application usage durations, process counts, login/session events, heartbeat coverage, and device inventory changes. Missing observations must remain missing or have an explicit completeness flag; a lack of heartbeat is not evidence of malicious intent.

Do not train a common model until:

1. A privacy-reviewed, minimized feature schema is versioned and maps each field to actual Windows/macOS events.
2. Identity mapping, event IDs, time-zone normalization, user-day closure and source coverage are validated on real endpoints.
3. Positive and negative labels come from independent analyst adjudication or another documented ground-truth source, not the risk score, FREEZE outcome, or synthetic scenario.
4. A sufficient, representative labeled dataset is available with source hashes and permitted-use provenance.
5. A preregistered employee/time split, leakage review, baseline, threshold selection, calibration review and held-out evaluation are reproducible.
6. Promotion is a separate reviewed release. The CERT model and risk policy are not silently replaced.

Until then, readiness is `INSUFFICIENT_DATA` / `INSUFFICIENT_LABELS` as applicable, and live endpoint RF status remains unavailable. No precision, recall, F1, false-positive rate or confusion matrix exists for endpoint-native behavior.

## Risk and provenance

The existing risk engine implementation is authoritative. It currently computes `max(ML threshold-mapped evidence, contextual evidence)` after grouping context by category; it does **not** implement the 70% ML / 30% context formula stated in the original task text. No formula, weight or threshold was changed here. Current RF score is not established as calibrated probability. Endpoint ML availability is kept separate from contextual risk and device trust.

Each authorized complete-aggregate inference includes model and feature-schema fingerprints, exact feature count, user-day aggregation and the provenance statement that the aggregate was externally supplied. That provenance does not attest to the correctness of the caller's source data. A missing feature or unavailable service fails closed; no prediction is substituted.

## Repeatable research command

Use only a separately reviewed, authorized dataset and a new, nonexistent output directory:

```powershell
python -m ml.research.experiment --input C:\AuthorizedData\reviewed-user-days.csv --source-manifest C:\AuthorizedData\source-manifest.json --output ml\experiments\endpoint-reviewed-01 --dataset-name "Reviewed endpoint user-day data" --split-strategy future-unseen-employee
```

Do not run this against synthetic smoke data for a real performance claim. The runner refuses to overwrite an existing output directory and does not write into the active `ml/models/` directory.

## Files to inspect

- `ml/research/ENDPOINT_FEATURE_COVERAGE.md` — exact CERT feature contract and platform source compatibility.
- `ml/research/experiment.py`, `provenance.py`, `raw_user_day.py` — isolated research pipeline and provenance gate.
- `server/services/ml-data-readiness.js`, `ml-feature-aggregator.js`, `ml-service.js` — production readiness and strict inference guard.
- `cyber/risk-engine/risk-engine.js` — current risk evidence mapping and formula.
