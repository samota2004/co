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


def feature_frame(features):
    if not isinstance(features, dict) or set(features) != set(FEATURE_NAMES):
        raise ValueError("Feature names must exactly match the configured user-day schema")
    for name in FEATURE_NAMES:
        value = features[name]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be finite and nonnegative")
    if features["day_of_week"] not in range(7) or features["is_weekend"] not in (0, 1):
        raise ValueError("Invalid calendar features")
    return pd.DataFrame([[features[name] for name in FEATURE_NAMES]], columns=FEATURE_NAMES)


def predict(features):
    probability = float(model.predict_proba(feature_frame(features))[0, list(model.classes_).index(1)])
    return {"threat_probability": round(probability, 6), "predicted_class": int(probability >= THRESHOLD), "operating_threshold": THRESHOLD, "model_fingerprint": MODEL_FINGERPRINT}
