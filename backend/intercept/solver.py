import math
from typing import Dict, List, Optional

EARTH_RADIUS_KM = 6371.0
KNOT_TO_KM_PER_HOUR = 1.852


def haversine_distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Calculate great-circle distance between two coordinates."""

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad)
        * math.cos(lat2_rad)
        * math.sin(delta_lon / 2) ** 2
    )

    return 2 * EARTH_RADIUS_KM * math.asin(
        math.sqrt(a)
    )


def calculate_intercept(
    asset_latitude: float,
    asset_longitude: float,
    asset_speed_knots: float,
    trajectory: List[Dict[str, float]],
) -> Optional[Dict[str, float]]:
    """
    Find the earliest feasible point at which the response
    asset can reach the predicted vessel trajectory.

    The vessel trajectory contains:
        latitude
        longitude
        minutes_ahead
    """

    if asset_speed_knots <= 0:
        return None

    asset_speed_kmh = (
        asset_speed_knots * KNOT_TO_KM_PER_HOUR
    )

    best_intercept = None

    for point in trajectory:

        minutes_ahead = float(point["minutes_ahead"])

        distance_km = haversine_distance_km(
            asset_latitude,
            asset_longitude,
            point["latitude"],
            point["longitude"],
        )

        asset_travel_minutes = (
            distance_km / asset_speed_kmh
        ) * 60.0

        # Asset must be able to reach this point
        # before or by the time the target reaches it.
        if asset_travel_minutes <= minutes_ahead:

            asset_bearing = calculate_bearing(
                asset_latitude,
                asset_longitude,
                point["latitude"],
                point["longitude"],
            )

            best_intercept = {
                "latitude": point["latitude"],
                "longitude": point["longitude"],
                "minutes_ahead": minutes_ahead,
                "distance_from_asset_km": round(
                    distance_km,
                    3,
                ),
                "asset_travel_minutes": round(
                    asset_travel_minutes,
                    1,
                ),
                "asset_course_degrees": round(
                    asset_bearing,
                    1,
                ),
            }

            break

    return best_intercept


def calculate_bearing(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Calculate initial bearing from point 1 to point 2."""

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)

    delta_lon = math.radians(lon2 - lon1)

    x = (
        math.sin(delta_lon)
        * math.cos(lat2_rad)
    )

    y = (
        math.cos(lat1_rad)
        * math.sin(lat2_rad)
        - math.sin(lat1_rad)
        * math.cos(lat2_rad)
        * math.cos(delta_lon)
    )

    bearing = math.degrees(
        math.atan2(x, y)
    )

    return (bearing + 360.0) % 360.0