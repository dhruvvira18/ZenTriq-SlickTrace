from sqlalchemy import text

from forensics.database import get_db_engine


def get_latest_vessel_position(mmsi: int):
    query = text("""
        SELECT
            mmsi,
            vessel_name,
            vessel_type,
            timestamp,
            latitude,
            longitude,
            speed_knots,
            heading
        FROM ais_vessel_positions
        WHERE mmsi = :mmsi
        ORDER BY timestamp DESC
        LIMIT 1
    """)

    engine = get_db_engine()

    with engine.connect() as connection:
        result = connection.execute(
            query,
            {"mmsi": mmsi},
        ).mappings().first()

    if result is None:
        return None

    return {
        "mmsi": result["mmsi"],
        "vessel_name": result["vessel_name"],
        "vessel_type": result["vessel_type"],
        "timestamp": result["timestamp"],
        "latitude": float(result["latitude"]),
        "longitude": float(result["longitude"]),
        "speed_knots": (
            float(result["speed_knots"])
            if result["speed_knots"] is not None
            else None
        ),
        "heading": (
            float(result["heading"])
            if result["heading"] is not None
            else None
        ),
    }