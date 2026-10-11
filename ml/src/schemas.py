from typing import Dict, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user: str = Field(min_length=1, max_length=128)
    features: Dict[str, Any]


class PredictionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user: str
    threat_probability: float = Field(ge=0.0, le=1.0)
    predicted_class: Literal[0, 1]
    operating_threshold: float = Field(ge=0.0, le=1.0)
    model_fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")
    xai_reasons: list
    authority: str
