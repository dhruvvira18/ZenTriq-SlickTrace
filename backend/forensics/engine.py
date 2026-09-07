import json
from datetime import datetime
from sqlalchemy import text

from .database import get_db_engine
from .scoring import (
    calculate_dark_ship_score,
    calculate_final_score,
    calculate_movement_score,
    calculate_spatial_proximity_score,
)

def get_dark_ship_evidence(dump_time: datetime):
    query = text("""
        SELECT
            mmsi,
            vessel_name,
            vessel_type,
            gap_start,
            gap_end,
            gap_duration_minutes,
            ST_Y(last_known_position) AS last_latitude,
            ST_X(last_known_position) AS last_longitude,
            ST_Y(next_known_position) AS next_latitude,
            ST_X(next_known_position) AS next_longitude,
            CASE
                WHEN :dump_time BETWEEN gap_start AND gap_end
                THEN TRUE
                ELSE FALSE
            END AS was_dark_at_dump
        FROM vessel_dark_gaps
        WHERE gap_start <= :dump_time
          AND gap_end >= :dump_time
        ORDER BY gap_duration_minutes DESC
    """)
    engine = get_db_engine()
    with engine.connect() as connection:
        result = connection.execute(query, {"dump_time": dump_time})
        return [dict(row._mapping) for row in result]

def get_spatial_evidence(dump_time: datetime, origin_latitude: float, origin_longitude: float):
    query = text("""
        WITH spill AS (
            SELECT ST_SetSRID(ST_MakePoint(:origin_longitude, :origin_latitude), 4326) AS geom
        ),
        dark_vessels AS (
            SELECT
                d.mmsi, d.vessel_name, d.vessel_type,
                LEAST(
                    ST_Distance(d.last_known_position::geography, spill.geom::geography),
                    ST_Distance(d.next_known_position::geography, spill.geom::geography)
                ) / 1000.0 AS distance_km,
                TRUE AS was_dark_at_dump
            FROM vessel_dark_gaps d
            CROSS JOIN spill
            WHERE d.gap_start <= :dump_time AND d.gap_end >= :dump_time
        ),
        normal_vessels AS (
            SELECT DISTINCT ON (a.mmsi)
                a.mmsi, a.vessel_name, a.vessel_type,
                ST_Distance(a.geom::geography, spill.geom::geography) / 1000.0 AS distance_km,
                FALSE AS was_dark_at_dump
            FROM ais_vessel_positions a
            CROSS JOIN spill
            WHERE NOT EXISTS (
                SELECT 1 FROM vessel_dark_gaps d
                WHERE d.mmsi = a.mmsi AND d.gap_start <= :dump_time AND d.gap_end >= :dump_time
            )
            ORDER BY a.mmsi, ABS(EXTRACT(EPOCH FROM (a.timestamp - :dump_time)))
        )
        SELECT * FROM dark_vessels
        UNION ALL
        SELECT * FROM normal_vessels
        ORDER BY distance_km ASC
    """)
    engine = get_db_engine()
    with engine.connect() as connection:
        result = connection.execute(query, {
            "dump_time": dump_time,
            "origin_latitude": origin_latitude,
            "origin_longitude": origin_longitude,
        })
        return [dict(row._mapping) for row in result]

def get_movement_evidence():
    query = text("""
        SELECT mmsi, vessel_name, max_speed_change_knots, max_robust_z, movement_score, anomaly_timestamp
        FROM vessel_movement_scores
        ORDER BY movement_score DESC
    """)
    engine = get_db_engine()
    with engine.connect() as connection:
        result = connection.execute(query)
        return [dict(row._mapping) for row in result]

def get_trajectory_evidence():
    query = text("""
        SELECT mmsi, ST_AsGeoJSON(trajectory) AS trajectory_geojson
        FROM vessel_trajectories
    """)
    engine = get_db_engine()
    with engine.connect() as connection:
        result = connection.execute(query)
        return [dict(row._mapping) for row in result]

def run_forensic_analysis(dump_time: datetime, origin_latitude: float, origin_longitude: float):
    dark_ship_data = get_dark_ship_evidence(dump_time)
    spatial_data = get_spatial_evidence(dump_time, origin_latitude, origin_longitude)
    movement_data = get_movement_evidence()
    trajectory_data = get_trajectory_evidence()

    dark_by_mmsi = {row["mmsi"]: row for row in dark_ship_data}
    spatial_by_mmsi = {row["mmsi"]: row for row in spatial_data}
    movement_by_mmsi = {row["mmsi"]: row for row in movement_data}
    trajectory_by_mmsi = {row["mmsi"]: row for row in trajectory_data}

    all_mmsi = set(dark_by_mmsi) | set(spatial_by_mmsi) | set(movement_by_mmsi)
    ranked_vessels = []

    for mmsi in all_mmsi:
        dark = dark_by_mmsi.get(mmsi)
        spatial = spatial_by_mmsi.get(mmsi)
        movement = movement_by_mmsi.get(mmsi)
        traj = trajectory_by_mmsi.get(mmsi)

        vessel_name = dark["vessel_name"] if dark else spatial["vessel_name"] if spatial else movement["vessel_name"]
        vessel_type = dark["vessel_type"] if dark else spatial["vessel_type"] if spatial else None

        dark_ship_score = calculate_dark_ship_score(gap_duration_minutes=dark["gap_duration_minutes"], was_dark_at_dump=dark["was_dark_at_dump"]) if dark else 0.0
        spatial_score = calculate_spatial_proximity_score(distance_km=spatial["distance_km"]) if spatial else 0.0
        movement_score = calculate_movement_score(robust_z=movement["max_robust_z"]) if movement else 0.0
        
        final_score = calculate_final_score(dark_ship_score=dark_ship_score, spatial_score=spatial_score, movement_score=movement_score)

        # Parse GeoJSON into Leaflet coordinates ([lat, lon])
        trajectory_path = []
        if traj and traj.get("trajectory_geojson"):
            geom = json.loads(traj["trajectory_geojson"])
            trajectory_path = [[pt[1], pt[0]] for pt in geom["coordinates"]]

        ranked_vessels.append({
            "mmsi": mmsi,
            "vessel_name": vessel_name,
            "vessel_type": vessel_type,
            "dark_ship_score": dark_ship_score,
            "spatial_score": spatial_score,
            "movement_score": movement_score,
            "final_score": final_score,
            "was_dark_at_dump": dark["was_dark_at_dump"] if dark else False,
            "distance_to_spill_km": spatial["distance_km"] if spatial else None,
            "gap_start": dark["gap_start"] if dark else None,
            "gap_end": dark["gap_end"] if dark else None,
            "trajectory_path": trajectory_path
        })

    ranked_vessels.sort(key=lambda vessel: vessel["final_score"], reverse=True)
    for rank, vessel in enumerate(ranked_vessels, start=1):
        vessel["rank"] = rank

    return {
        "dump_time": dump_time,
        "origin": {"latitude": origin_latitude, "longitude": origin_longitude},
        "vessels": ranked_vessels,
    }