from datetime import datetime
from pydantic import BaseModel, Field


class ForensicAnalysisRequest(BaseModel):
    dump_time: datetime
    origin_latitude: float = Field(ge=-90, le=90)
    origin_longitude: float = Field(ge=-180, le=180)


class VesselForensicResult(BaseModel):
    mmsi: int
    vessel_name: str
    vessel_type: str
    dark_ship_score: float
    spatial_score: float
    movement_score: float
    final_score: float
    was_dark_at_dump: bool
    distance_to_spill_km: float | None
    rank: int


class ForensicAnalysisResponse(BaseModel):
    dump_time: datetime
    origin: dict[str, float]
    vessels: list[VesselForensicResult]