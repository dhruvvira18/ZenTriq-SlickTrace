import math
from typing import List, Dict


EARTH_RADIUS_KM = 6371.0


def destination_point(
    latitude: float,
    longitude: float,
    heading_degrees: float,
    distance_km: float,
) -> tuple[float, float]:
    """
    Calculate a destination point given:
    - starting latitude/longitude
    - heading in degrees
    - travel distance in kilometres
    """

    lat1 = math.radians(latitude)
    lon1 = math.radians(longitude)
    bearing = math.radians(heading_degrees)

    angular_distance = distance_km / EARTH_RADIUS_KM

    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1)
        * math.sin(angular_distance)
        * math.cos(bearing)
    )

    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance)
        - math.sin(lat1) * math.sin(lat2),
    )

    return (
        math.degrees(lat2),
        ((math.degrees(lon2) + 540) % 360) - 180,
    )


def predict_vessel_position(
    latitude: float,
    longitude: float,
    speed_knots: float,
    heading_degrees: float,
    minutes_ahead: float,
) -> Dict[str, float]:
    """
    Predict vessel position using constant speed and heading.

    Returns predicted latitude, longitude and uncertainty radius.
    """

    # 1 knot = 1 nautical mile/hour
    # 1 nautical mile = 1.852 km
    distance_km = (
        speed_knots
        * 1.852
        * (minutes_ahead / 60.0)
    )

    predicted_latitude, predicted_longitude = destination_point(
        latitude,
        longitude,
        heading_degrees,
        distance_km,
    )

    # Prototype uncertainty model.
    # Uncertainty increases with elapsed prediction time.
    uncertainty_km = 0.5 + 0.10 * minutes_ahead

    return {
        "latitude": predicted_latitude,
        "longitude": predicted_longitude,
        "uncertainty_km": uncertainty_km,
        "distance_travelled_km": distance_km,
    }


def generate_prediction_trajectory(
    latitude: float,
    longitude: float,
    speed_knots: float,
    heading_degrees: float,
    prediction_minutes: int = 120,
    interval_minutes: int = 5,
) -> List[Dict[str, float]]:
    """
    Generate a forward prediction trajectory.

    A prediction point is generated every interval_minutes.
    """

    trajectory = []

    for minutes_ahead in range(
        0,
        prediction_minutes + 1,
        interval_minutes,
    ):
        point = predict_vessel_position(
            latitude=latitude,
            longitude=longitude,
            speed_knots=speed_knots,
            heading_degrees=heading_degrees,
            minutes_ahead=minutes_ahead,
        )

        point["minutes_ahead"] = minutes_ahead
        trajectory.append(point)

    return trajectory

def destination_point_with_offset(
    latitude: float,
    longitude: float,
    heading_degrees: float,
    forward_distance_km: float,
    lateral_offset_km: float,
) -> tuple[float, float]:
    """
    Calculate a point that is:
    - forward along the vessel heading
    - shifted laterally from the center trajectory

    Positive lateral offset = right side of heading.
    Negative lateral offset = left side.
    """

    # A perpendicular bearing represents the lateral direction.
    lateral_heading = (heading_degrees + 90.0) % 360.0

    center_latitude, center_longitude = destination_point(
        latitude,
        longitude,
        heading_degrees,
        forward_distance_km,
    )

    return destination_point(
        center_latitude,
        center_longitude,
        lateral_heading,
        lateral_offset_km,
    )


def generate_probability_cone(
    latitude: float,
    longitude: float,
    speed_knots: float,
    heading_degrees: float,
    prediction_minutes: int = 120,
    interval_minutes: int = 5,
    cone_points: int = 12,
) -> Dict[str, object]:
    """
    Generate a forward-looking uncertainty cone around
    the predicted vessel trajectory.

    The cone widens as prediction time increases.
    """

    trajectory = generate_prediction_trajectory(
        latitude=latitude,
        longitude=longitude,
        speed_knots=speed_knots,
        heading_degrees=heading_degrees,
        prediction_minutes=prediction_minutes,
        interval_minutes=interval_minutes,
    )

    left_boundary = []
    right_boundary = []

    for point in trajectory:
        forward_distance = point["distance_travelled_km"]
        uncertainty = point["uncertainty_km"]

        left_latitude, left_longitude = destination_point_with_offset(
            latitude=latitude,
            longitude=longitude,
            heading_degrees=heading_degrees,
            forward_distance_km=forward_distance,
            lateral_offset_km=-uncertainty,
        )

        right_latitude, right_longitude = destination_point_with_offset(
            latitude=latitude,
            longitude=longitude,
            heading_degrees=heading_degrees,
            forward_distance_km=forward_distance,
            lateral_offset_km=uncertainty,
        )

        left_boundary.append(
            [left_longitude, left_latitude]
        )

        right_boundary.append(
            [right_longitude, right_latitude]
        )

    # Close the polygon by returning along the opposite boundary.
    polygon = (
        left_boundary
        + list(reversed(right_boundary))
        + [left_boundary[0]]
    )

    return {
        "trajectory": trajectory,
        "left_boundary": left_boundary,
        "right_boundary": right_boundary,
        "polygon": polygon,
    }