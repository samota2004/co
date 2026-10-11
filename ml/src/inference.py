import json
import hashlib
import math
import os
from pathlib import Path

import joblib
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_DIR = Path(os.environ.get("CYBERORBIT_MODEL_DIR") or BASE_DIR / "models")
MODEL_PATH = MODEL_DIR / "multi_source_ueba_rf.joblib"
model = joblib.load(MODEL_PATH)
schema = json.loads((MODEL_DIR / "multi_source_feature_schema.json").read_text())
metadata = json.loads((MODEL_DIR / "multi_source_model_metadata.json").read_text())
FEATURE_NAMES = schema["feature_names"]
THRESHOLD = float(metadata["operating_threshold"])
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
