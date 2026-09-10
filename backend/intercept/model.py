from pydantic import BaseModel, Field


class InterceptPredictionRequest(BaseModel):
    mmsi: int = Field(..., description="Target vessel MMSI")

    prediction_minutes: int = Field(
        default=120,
        ge=5,
        le=360,
    )

    interval_minutes: int = Field(
        default=5,
        ge=1,
        le=60,
    )


class InterceptPredictionResponse(BaseModel):
    type: str
    features: list
    metadata: dict