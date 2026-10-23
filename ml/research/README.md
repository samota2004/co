# Reproducible baseline and contextual comparison

See [FEATURE_AUDIT.md](FEATURE_AUDIT.md) for the per-feature source and time audit. The checked-in RF response's `threat_probability` field is a legacy API name for an **uncalibrated positive-class Random Forest score**; it must not be described as a calibrated posterior probability.

## Raw staging and calibration added after the initial baseline

The official [SEI dataset page](https://www.sei.cmu.edu/library/insider-threat-test-dataset/) identifies `answers.tar.bz2` as the answer-key archive and directs users to the [CMU dataset DOI](https://doi.org/10.1184/R1/12841247.v1). No official release archive, extracted five logs, release README, or authorized answer archive was found in this workspace. A published r4.2 dataset description lists `logon.csv`, `device.csv`, `file.csv`, `http.csv`, `email.csv`, `psychometric.csv`, and LDAP material; only the five event CSV candidates are read by the provisional stage. Verify exact headers, time zone, license/terms and answer-key format against the obtained release README before research use. Place files under ignored `ml/data/cert-r4.2/` with the five CSVs in `r4.2/` and the release README alongside them. Keep `answers.tar.bz2` under the same ignored root, outside Git. The exact answer-key member and label interval mapping remain unverified.

| Expected local input | Purpose and provisional format | Required provenance |
| --- | --- | --- |
| `ml/data/cert-r4.2/r4.2/{logon,device,file,http,email}.csv` | Five event CSVs; `id,date,user,pc` plus source-specific columns declared in `raw_user_day.SCHEMA` | Official release archive/source URL, release ID, SHA256 of each extracted file, reviewed headers |
| `ml/data/cert-r4.2/r4.2/README.txt` (replace name with actual release README) | Release schema, timestamp/time-zone and usage notes | Official archive member name and SHA256; human review required |
| `ml/data/cert-r4.2/answers.tar.bz2` | SEI-described answer-key archive; no parsing is implemented | Authorized source and SHA256, permitted use; review actual member names/label intervals |
| Reviewed user-day label mapping (location chosen by researcher) | Independent `user_id,date,label` mapping from permitted answer key; exact conversion is not yet implemented | Mapping script/version, answer-key hash, inclusion/exclusion rule and review record |

The dataset archive is commonly described as `r4.2.tar.bz2`, but the actual download filename/member layout must be checked against the acquired official release. No answer-key member filename or column schema is assumed here.

`raw_user_day.py` checks the five notebook-declared source headers, parses timestamps to UTC, rejects malformed/out-of-order/conflicting/duplicate rows, records counts and source hashes, and emits a deterministic **21-feature staging table** using the formulas inspected in `Capstone.ipynb`. It uses only source columns actually read by that notebook; in particular recipients are distinct `to` values, and no content or telemetry is invented. The generated order is checked against the saved 21-feature schema in tests. This does not establish that the acquired CERT release has matching provenance or exact headers, nor does it establish parity on real records: the notebook did not deduplicate events, while staging rejects them, and empty/nonnumeric input handling is stricter. Seven contextual fields remain outside this raw feature table. An optional, independently prepared CSV must have exactly `user_id,date,label` columns, explicit binary labels for **every staged user-day**, unique keys and ISO dates. Missing days cannot silently become negatives. The stage cannot verify how the answer archive was converted; outputs remain `not_model_ready` and `research_evaluation_eligible=false` until source and label provenance are reviewed.

The provisional parser assumes timestamps without offsets are UTC. The original release time zone must be checked before a real run. It holds event IDs and distinct PC/file/URL sets in memory, so full r4.2 scale may exceed a workstation's RAM; a disk-backed aggregation stage is still needed before claiming full-dataset support. On any rejected row the stage writes a manifest with counts/reasons and emits no feature CSV. Unsupported headers fail before extraction and require a human schema review.

```powershell
python -B -m ml.research.raw_user_day --input-dir ml/data/cert-r4.2/r4.2 --release-readme ml/data/cert-r4.2/r4.2/README.txt --output ml/experiments/raw-stage-01
```

`calibration.py` is an **offline audit** of an existing experiment. It verifies the source/model/split checksums and exact per-row labels, fits sigmoid and isotonic maps on the first half of validation, selects by Brier score on the other half, selects an F1 threshold on that same selection portion, and compares the selected map with the raw RF score and constant fit-partition prevalence on untouched test rows. The split checksum is bound to `experiment-config.json`; older experiments without it must be rerun before calibration. It saves the selected calibrator, all partition predictions, confusion counts, discrimination, Brier, reliability bins and metadata. It does not activate the calibrator or change production risk thresholds. Small partitions or missing classes fail explicitly. Tests on synthetic fixtures verify plumbing, **not** real-data calibration.

`--max-validation-fpr 0.05` can impose a predeclared research selection constraint, if a 5% validation false-positive ceiling is appropriate for the intended deployment; the value is an example, not an empirically established policy. Without this option the saved threshold maximizes validation-selection F1 only. Neither value is deployed automatically.

```powershell
python -B -m ml.research.calibration --experiment-dir ml/experiments/your-reviewed-run --output ml/experiments/calibration-01
```

`policy_eval.mjs` replays labelled request sequences through context-only, risk-only, risk-plus-trust and conservative-review policy variants. It separately reports legitimate challenges and denials, threat-labelled requests allowed, MFA, approval, containment, repeated alerts and detection delays. Trust increases during supplied holds are flagged as **input-sequence diagnostics**, not simulated recovery. It is a counterfactual **simulation** with fixed supplied risk/trust, not an observed effect on employees; the input must explicitly mark every row `synthetic` true/false and include documented labels. Use `--policy-config` with an exported company-policy JSON to replace defaults. Non-synthetic sequences require `--source-manifest` with `dataset_name`, `label_source`, `label_definition`, `usage_restrictions`, and `input_sha256`; even that manifest is only a provenance gate, not independent validation.

```powershell
node ml/research/policy_eval.mjs --input ml/data/your-labelled-sequence.json --output ml/experiments/policy-01
```

The repository contains the original `Capstone.ipynb`, a saved supervised Random Forest, an ordered 21-feature schema and recorded metrics. The notebook contains feature formulas and label/split code, but its external raw dataset and original saved training run outputs are not present; notebook outputs and metadata metrics have not been independently reproduced. At its recorded threshold 0.85, the recorded test recall is 0.2416 and F1 is 0.3273 despite accuracy 0.9970; accuracy must not be described as threat detection rate.

`experiment.py` trains two new, separately exported models using identical rows: a 21-feature baseline and a 28-feature contextual enhancement. The default split is chronological 60/20/20 UTC days; `--split-strategy employee-disjoint` instead partitions people with a recorded seed. `--split-strategy future-unseen-employee` requires **both** later dates and disjoint users: training uses early days/one user group, validation uses middle days/a second group, and test uses late days/a third group. Unused user-date cells are explicitly recorded as `excluded` in the split manifest, so this stricter test uses fewer rows and may fail on scarce positives. It selects each operating threshold using validation F1 only, then measures the untouched test split. It records seed, input and split SHA256, source manifest, exact split membership, validation/test predictions and labels, model parameters, versions, confusion counts, Accuracy/Precision/Recall/F1/ROC-AUC/average precision (the legacy `PR_AUC` field), FPR/FNR, ROC/PR points and feature importances. No improvement is assumed.

## Input contract

Supply an authorized CSV with one row per `user_id,date`, binary `label`, all names in `ml/models/multi_source_feature_schema.json`, and:

| Context column | Required meaning |
| --- | --- |
| `device_trust` | Verified logical-device score, 0–100, known at evaluation time |
| `cross_department` | 0/1 resource/employee department mismatch |
| `is_off_hours` | 0/1 against policy or baseline learned from prior days |
| `failed_logins` | Observed prior failures in a consistently documented window |
| `download_volume_mb` | Observed volume; distinguish reads from changes |
| `resource_sensitivity` | PUBLIC=0, INTERNAL=1, CONFIDENTIAL=2, HIGHLY_SENSITIVE=3 |
| `unusual_location` | 0/1 against a baseline from prior observations |

All model fields must be finite nonnegative numeric values. Calendar fields use Monday=0 through Sunday=6 and `is_weekend` 0/1. The active model's window is **user-day** across logon/device/file/http/email sources. `total_activity`, `cross_source_activity`, PC uniqueness, file/content events, URLs, recipients, email size and attachment definitions must match the original source preprocessing. The schema alone cannot establish undocumented aggregation details. Do not silently implement a guessed CERT transform or infer URL/content/email features from connection/file-change metadata. Require a reviewed source-specific preprocessing manifest before using real source CSV exports for research or inference.

Use only context available before the decision, not future labels or incident outcomes. Real input must include UTC `feature_available_at` and `decision_at` for every row. A completed user-day aggregate cannot be available before 23:59:59 UTC on its date, and must be available no later than its declared decision time. Delayed ingestion is permitted only when the decision is correspondingly later. These timestamp declarations do not establish their own truth: an independent source review must verify event arrival times and that every aggregate and prior-history feature was actually observable by the decision. Input dates must be ordered, user/date pairs unique, values finite, and each split must contain both classes. No data-dependent preprocessing or feature selection is currently fit; both models use validated columns directly. Keep restricted datasets under ignored `ml/data/`, and do not commit them. Scrub/pseudonymize identifiers.

## Real-data provenance gate

No official CERT r4.2 raw logs, release documentation or authorized answer key are present here. The notebook's 21-feature formulas and scenario-label implementation are available for code review, but the release schema, original data, and answer-key conversion cannot be independently validated. The raw stage now implements those notebook formulas as an explicit candidate extractor; compare them with the acquired release documentation and investigate any duplicate rows before research use. Seven contextual fields still require independently reviewed definitions and sources. Do not run or report a real-data evaluation until authorized files, label mapping, and split review are complete.

For a non-synthetic run provide `--source-manifest path/to/manifest.json`. It must name `dataset_name`, `dataset_version`, `label_definition`, `label_source`, `feature_generation_version`, `usage_restrictions`, and `source_files` as `{ "path": "...", "sha256": "..." }` objects including the aggregate CSV. CERT manifests also require `answer_key_file` with a checked path and SHA256. The runner verifies presence and checksums; it cannot prove that the CSV labels were correctly derived from that key. Record original file identity, release README and authorization terms in the manifest. Avoid placing raw restricted data in Git.

Stages currently executable: aggregate CSV input and provenance validation -> schema/calendar/ordering/time audit -> fixed ordered feature selection -> label validation -> chronological, employee-disjoint or combined future/unseen split -> train-only RF fitting -> validation-only threshold selection -> predictions -> untouched test evaluation. `split-manifest.csv`, `experiment-config.json`, `leakage-audit.json`, per-model validation/test predictions, model/schema/metadata, figures and `experiment-report.json` are written only to a new output directory. The original active model is not overwritten. A source manifest can pass checksum validation (`provenance_gate_passed`) while `research_evaluation_eligible` remains false: original feature extraction and answer-key derivation still need independent review.

```powershell
python -m ml.research.experiment --input C:\AuthorizedData\reviewed-user-days.csv --source-manifest C:\AuthorizedData\source-manifest.json --output ml\experiments\cert-run-01 --dataset-name "Authorized CERT aggregate export"
```

Every output directory must be new. Existing active models are never overwritten. To display a completed comparison, set `ML_EXPERIMENT_REPORT` to the absolute generated `experiment-report.json` path and restart the existing backend. Reports retain synthetic/dataset provenance and actual curves. To deliberately activate an exported model, set **both services'** `CYBERORBIT_MODEL_DIR` to the matching `baseline` or `enhanced` artifact directory, then restart both. The 28-feature model requires all 28 fields; live endpoint coverage remains incomplete.

## Smoke test without licensed data

```powershell
python -m ml.research.synthetic_fixture --output ml\experiments\toy-01.csv
python -m ml.research.experiment --input ml\experiments\toy-01.csv --output ml\experiments\toy-run-01 --dataset-name "Synthetic smoke fixture" --synthetic --trees 40
```

The v2 generator defines a latent event scenario separately from noisy behavior counts and context fields; it does not copy the target into any feature. Scenarios can still be unrealistically easy or correlated with identifiers and calendar patterns. `provenance.audit_features` flags forbidden input names, univariate disjoint label/value supports and future declared availability, but cannot prove freedom from upstream leakage or interaction effects. Its metrics verify plumbing only. They are not real monitoring events, CERT results or evidence of reduced enterprise false positives. Old saved synthetic smoke results used the earlier label-derived generator and must not be cited as research evidence.

Research contribution: assess whether contextual signals and explainable policy integration improve measured classification and operational responses compared with the baseline. Licensed data access, original-feature provenance, attack labels and a valid paired real-data experiment remain necessary for any publication claim. No trained RL optimizer or Isolation Forest is deployed.
