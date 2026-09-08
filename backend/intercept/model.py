from pydantic import BaseModel, Field


class InterceptPredictionRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    speed_knots: float = Field(..., ge=0)
    heading_degrees: float = Field(..., ge=0, lt=360)

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