# Reproducible baseline and contextual comparison

The original repository contains a saved supervised Random Forest, an ordered 21-feature schema and a CERT r4.2 report. It does not contain the original raw-data preprocessing code or licensed source dataset. The existing report is attributed to that artifact, not independently reproduced by this change. At its recorded threshold 0.85, test recall is 0.2416 and F1 is 0.3273 despite accuracy 0.9970; accuracy must not be described as threat detection rate.

`experiment.py` trains two new, separately exported models using identical chronological 60/20/20 UTC-day splits: a 21-feature baseline and a 28-feature contextual enhancement. It selects each operating threshold using validation F1 only, then measures the untouched test split. It records seed, input SHA256, row counts, date boundaries, versions, confusion counts, Accuracy/Precision/Recall/F1/ROC-AUC/PR-AUC/FPR/FNR, actual ROC/PR points, feature importances and standalone PNG figures. It reports absolute differences, including regressions. No improvement is assumed.

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

Use only context available before the decision, not future labels or incident outcomes. User overlap is permitted across chronological splits and explicitly reported; this is not an unseen-user generalization experiment. At least 10 days and both classes in each split are required. Keep restricted datasets under ignored `ml/data/`, and do not commit them. Scrub/pseudonymize identifiers. A privacy-preserving production import should validate its aggregation-window manifest before submission.

```powershell
python -m ml.research.experiment --input C:\AuthorizedData\reviewed-user-days.csv --output ml\experiments\cert-run-01 --dataset-name "Authorized CERT aggregate export"
```

Every output directory must be new. Existing active models are never overwritten. To display a completed comparison, set `ML_EXPERIMENT_REPORT` to the absolute generated `experiment-report.json` path and restart the existing backend. Reports retain synthetic/dataset provenance and actual curves. To deliberately activate an exported model, set **both services'** `CYBERORBIT_MODEL_DIR` to the matching `baseline` or `enhanced` artifact directory, then restart both. The 28-feature model requires all 28 fields; live endpoint coverage remains incomplete.

## Smoke test without licensed data

```powershell
python -m ml.research.synthetic_fixture --output ml\experiments\toy-01.csv
python -m ml.research.experiment --input ml\experiments\toy-01.csv --output ml\experiments\toy-run-01 --dataset-name "Synthetic smoke fixture" --synthetic --trees 40
```

This generated dataset is deliberately simple and labelled **synthetic**. Its metrics verify plumbing only. They are not real monitoring events, CERT results or evidence of reduced enterprise false positives. The application simulator also uses clearly labelled inputs and does not manufacture a full feature vector for model inference.

Research contribution: assess whether contextual signals and explainable policy integration improve measured classification and operational responses compared with the baseline. Licensed data access, original-feature provenance, attack labels and a valid paired real-data experiment remain necessary for any publication claim. No trained RL optimizer or Isolation Forest is deployed.
