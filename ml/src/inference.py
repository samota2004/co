import json
import hashlib
import math
import os
from pathlib import Path

import joblib
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _model_dir_setting(project_root):
    """Read the model override from process env or the project's simple .env entry."""
    if "CYBERORBIT_MODEL_DIR" in os.environ:
        return os.environ.get("CYBERORBIT_MODEL_DIR")
    env_file = Path(project_root) / ".env"
    try:
        lines = env_file.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return None
    for line in lines:
        candidate = line.strip()
        if candidate.startswith("export "):
            candidate = candidate[7:].lstrip()
        if not candidate.startswith("CYBERORBIT_MODEL_DIR="):
            continue
        value = candidate.split("=", 1)[1].strip()
        if value[:1] in ("'", '"'):
            quote = value[0]
            closing = value.find(quote, 1)
            if closing < 0:
                return None
            value = value[1:closing]
        else:
            value = value.split("#", 1)[0].strip()
        return value or None
    return None


def resolve_model_dir(configured=None, project_root=PROJECT_ROOT):
    configured = configured if configured is not None else _model_dir_setting(project_root)
    if not configured:
        return (project_root / "ml" / "models").resolve()
    candidate = Path(configured).expanduser()
    return (candidate if candidate.is_absolute() else project_root / candidate).resolve()


MODEL_DIR = resolve_model_dir()
MODEL_PATH = MODEL_DIR / "multi_source_ueba_rf.joblib"
model = joblib.load(MODEL_PATH)
# Inference uses one worker; the saved training parallelism does not affect
# predictions and can fail on restricted Windows hosts.
model.n_jobs = 1
schema = json.loads((MODEL_DIR / "multi_source_feature_schema.json").read_text())
metadata = json.loads((MODEL_DIR / "multi_source_model_metadata.json").read_text())
FEATURE_NAMES = schema["feature_names"]
THRESHOLD = float(metadata["operating_threshold"])
if (not isinstance(FEATURE_NAMES, list) or not FEATURE_NAMES or
        any(not isinstance(name, str) for name in FEATURE_NAMES) or
        len(set(FEATURE_NAMES)) != len(FEATURE_NAMES) or
        schema.get("feature_count") != len(FEATURE_NAMES) or
        metadata.get("feature_count") != len(FEATURE_NAMES) or
        getattr(model, "n_features_in_", None) != len(FEATURE_NAMES) or
        1 not in getattr(model, "classes_", [])):
    raise RuntimeError("Configured model, feature schema, and metadata are incompatible")
if not math.isfinite(THRESHOLD) or not 0 < THRESHOLD < 1:
    raise RuntimeError("Configured operating threshold must be between zero and one")
MODEL_FINGERPRINT = hashlib.sha256(MODEL_PATH.read_bytes() + (MODEL_DIR / "multi_source_feature_schema.json").read_bytes() + (MODEL_DIR / "multi_source_model_metadata.json").read_bytes()).hexdigest()
FEATURE_SCHEMA_FINGERPRINT = hashlib.sha256((MODEL_DIR / "multi_source_feature_schema.json").read_bytes()).hexdigest()


def feature_frame(features):
    if not isinstance(features, dict) or set(features) != set(FEATURE_NAMES):
        raise ValueError("Feature names must exactly match the configured user-day schema")
    for name in FEATURE_NAMES:
        value = features[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be finite and nonnegative")
    if features["day_of_week"] not in range(7) or features["is_weekend"] not in (0, 1):
        raise ValueError("Invalid calendar features")
    if features["is_weekend"] != int(features["day_of_week"] >= 5):
        raise ValueError("is_weekend must match the Monday-zero day_of_week value")
    integer_features = {
        "logon_count", "device_event_count", "file_event_count", "http_event_count", "email_event_count",
        "logon_unique_pc_count", "device_unique_pc_count", "file_unique_pc_count", "http_unique_pc_count",
        "email_unique_pc_count", "unique_files", "file_content_events", "unique_urls", "unique_http_content",
        "unique_recipients", "total_activity", "cross_source_activity",
    }
    for name in integer_features:
        if not float(features[name]).is_integer():
            raise ValueError(f"{name} must be an integer count")
    source_counts = [features[name] for name in ("logon_count", "device_event_count", "file_event_count", "http_event_count", "email_event_count")]
    if features["total_activity"] != sum(source_counts):
        raise ValueError("total_activity must equal the five source event counts")
    if features["cross_source_activity"] != sum(value > 0 for value in source_counts):
        raise ValueError("cross_source_activity must equal the number of nonempty source families")
    bounds = {
        "logon_unique_pc_count": features["logon_count"], "device_unique_pc_count": features["device_event_count"],
        "file_unique_pc_count": features["file_event_count"], "http_unique_pc_count": features["http_event_count"],
        "email_unique_pc_count": features["email_event_count"], "unique_files": features["file_event_count"],
        "file_content_events": features["file_event_count"], "unique_urls": features["http_event_count"],
        "unique_http_content": features["http_event_count"], "unique_recipients": features["email_event_count"],
    }
    for name, maximum in bounds.items():
        if features[name] > maximum:
            raise ValueError(f"{name} cannot exceed its source event count")
    return pd.DataFrame([[features[name] for name in FEATURE_NAMES]], columns=FEATURE_NAMES)


def predict(features):
    probability = float(model.predict_proba(feature_frame(features))[0, list(model.classes_).index(1)])
    return {"threat_probability": round(probability, 6), "predicted_class": int(probability >= THRESHOLD), "operating_threshold": THRESHOLD, "model_fingerprint": MODEL_FINGERPRINT, "model_name": metadata["model_name"], "model_version": MODEL_FINGERPRINT, "feature_schema_fingerprint": FEATURE_SCHEMA_FINGERPRINT, "feature_count": len(FEATURE_NAMES), "aggregation_level": metadata["aggregation_level"], "provenance": "complete externally supplied user-day aggregate; not derived from live endpoint events"}
