from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ForensicAnalysisRequest(BaseModel):
    dump_time: datetime

    origin_latitude: float = Field(
        ge=-90,
        le=90,
    )

    origin_longitude: float = Field(
        ge=-180,
        le=180,
    )


class TrajectoryPoint(BaseModel):
    timestamp: datetime
    latitude: float
    longitude: float
    sog: Optional[float] = None
    cog: Optional[float] = None


class VesselForensicResult(BaseModel):
    mmsi: int

    vessel_name: str

    vessel_type: str

    dark_ship_score: float

    spatial_score: float

    movement_score: float

    final_score: float

    was_dark_at_dump: bool

    distance_to_spill_km: Optional[float] = None

    rank: int

    # ---------------------------------------------------------
    # Dark-ship telemetry
    # ---------------------------------------------------------

    gap_start: Optional[datetime] = None

    gap_end: Optional[datetime] = None

    gap_duration_minutes: Optional[float] = None

    last_known_latitude: Optional[float] = None

    last_known_longitude: Optional[float] = None

    next_known_latitude: Optional[float] = None

    next_known_longitude: Optional[float] = None

    # ---------------------------------------------------------
    # AIS trajectory
    # ---------------------------------------------------------

    trajectory_path: List[List[float]] = Field(
        default_factory=list
    )

    trajectory_points: List[TrajectoryPoint] = Field(
        default_factory=list
    )

    trajectory_start: Optional[datetime] = None

    trajectory_end: Optional[datetime] = None


class ForensicAnalysisResponse(BaseModel):
    dump_time: datetime

    origin: dict[str, float]

    vessels: list[VesselForensicResult]