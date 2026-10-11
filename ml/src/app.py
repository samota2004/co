import logging
from fastapi import FastAPI, HTTPException
from .inference import predict, metadata, FEATURE_NAMES, MODEL_FINGERPRINT
from .xai import explain
from .schemas import PredictionRequest, PredictionResponse

app = FastAPI(title="CYBERORBIT user-day ML inference", version="3.0.0")


@app.get("/health")
def health():
    return {"status": "ok", "model": metadata["model_name"], "feature_count": len(FEATURE_NAMES), "operating_threshold": metadata["operating_threshold"], "model_fingerprint": MODEL_FINGERPRINT}


@app.post("/predict", response_model=PredictionResponse)
def predict_endpoint(request: PredictionRequest):
    try:
        result = predict(request.features)
        return {"user": request.user, **result, "xai_reasons": explain(request.features, top_n=5), "authority": "Inference only. Backend applies company policy and persists trust."}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from None
    except Exception:
        logging.exception("ML inference failed")
        raise HTTPException(status_code=503, detail="ML inference unavailable") from None
