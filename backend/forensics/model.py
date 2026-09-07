from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

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
    # --- New Frontend Telemetry Fields ---
    gap_start: Optional[datetime] = None
    gap_end: Optional[datetime] = None
    trajectory_path: List[List[float]] = []

class ForensicAnalysisResponse(BaseModel):
    dump_time: datetime
    origin: dict[str, float]
    vessels: list[VesselForensicResult]