import math
from typing import List, Dict, Optional


EARTH_RADIUS_KM = 6371.0
KNOT_TO_KM_PER_HOUR = 1.852


def destination_point(
    latitude: float,
    longitude: float,
    heading_degrees: float,
    distance_km: float,
) -> tuple[float, float]:
    """
    Calculate destination coordinates from a starting point,
    bearing and travel distance.
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
        math.sin(bearing)
        * math.sin(angular_distance)
        * math.cos(lat1),
        math.cos(angular_distance)
        - math.sin(lat1) * math.sin(lat2),
    )

    return (
        math.degrees(lat2),
        ((math.degrees(lon2) + 540) % 360) - 180,
    )


def vector_from_speed_heading(
    speed_knots: float,
    heading_degrees: float,
) -> tuple[float, float]:
    """
    Convert speed + heading into east/north velocity components.

    Returns:
        east_knots, north_knots
    """

    heading = math.radians(heading_degrees)

    east = speed_knots * math.sin(heading)
    north = speed_knots * math.cos(heading)

    return east, north


def speed_heading_from_vector(
    east_knots: float,
    north_knots: float,
) -> tuple[float, float]:
    """
    Convert east/north velocity components into speed + heading.
    """

    speed = math.sqrt(
        east_knots ** 2 +
        north_knots ** 2
    )

    if speed == 0:
        return 0.0, 0.0

    heading = math.degrees(
        math.atan2(east_knots, north_knots)
    ) % 360.0

    return speed, heading


def apply_environmental_forcing(
    speed_knots: float,
    heading_degrees: float,
    current_east_knots: float = 0.0,
    current_north_knots: float = 0.0,
    wind_east_knots: float = 0.0,
    wind_north_knots: float = 0.0,
    windage_factor: float = 0.0,
) -> Dict[str, float]:
    """
    Combine vessel motion with environmental forcing.

    Ocean current:
        Added directly to vessel velocity.

    Wind:
        Applied through a configurable windage factor.

    For powered vessels, windage_factor should normally be
    small. It represents the fraction of wind velocity that
    contributes to vessel drift.

    Returns ground speed and ground heading.
    """

    vessel_east, vessel_north = vector_from_speed_heading(
        speed_knots,
        heading_degrees,
    )

    wind_effect_east = wind_east_knots * windage_factor
    wind_effect_north = wind_north_knots * windage_factor

    ground_east = (
        vessel_east
        + current_east_knots
        + wind_effect_east
    )

    ground_north = (
        vessel_north
        + current_north_knots
        + wind_effect_north
    )

    ground_speed, ground_heading = speed_heading_from_vector(
        ground_east,
        ground_north,
    )

    return {
        "east_knots": ground_east,
        "north_knots": ground_north,
        "ground_speed_knots": ground_speed,
        "ground_heading_degrees": ground_heading,
    }


def predict_vessel_position(
    latitude: float,
    longitude: float,
    speed_knots: float,
    heading_degrees: float,
    minutes_ahead: float,
    current_east_knots: float = 0.0,
    current_north_knots: float = 0.0,
    wind_east_knots: float = 0.0,
    wind_north_knots: float = 0.0,
    windage_factor: float = 0.0,
) -> Dict[str, float]:
    """
    Predict vessel position using AIS motion plus
    environmental forcing.
    """

    environmental_velocity = apply_environmental_forcing(
        speed_knots=speed_knots,
        heading_degrees=heading_degrees,
        current_east_knots=current_east_knots,
        current_north_knots=current_north_knots,
        wind_east_knots=wind_east_knots,
        wind_north_knots=wind_north_knots,
        windage_factor=windage_factor,
    )

    ground_speed = environmental_velocity["ground_speed_knots"]
    ground_heading = environmental_velocity["ground_heading_degrees"]

    distance_km = (
        ground_speed
        * KNOT_TO_KM_PER_HOUR
        * (minutes_ahead / 60.0)
    )

    predicted_latitude, predicted_longitude = destination_point(
        latitude=latitude,
        longitude=longitude,
        heading_degrees=ground_heading,
        distance_km=distance_km,
    )

    # Prototype uncertainty model.
    # Environmental forcing increases uncertainty slightly.
    environmental_magnitude = math.sqrt(
        current_east_knots ** 2
        + current_north_knots ** 2
        + (
            wind_east_knots * windage_factor
        ) ** 2
        + (
            wind_north_knots * windage_factor
        ) ** 2
    )

    uncertainty_km = (
        0.5
        + 0.10 * minutes_ahead
        + 0.05 * environmental_magnitude
        * (minutes_ahead / 60.0)
    )

    return {
        "latitude": predicted_latitude,
        "longitude": predicted_longitude,
        "uncertainty_km": uncertainty_km,
        "distance_travelled_km": distance_km,
        "ground_speed_knots": ground_speed,
        "ground_heading_degrees": ground_heading,
        "current_east_knots": current_east_knots,
        "current_north_knots": current_north_knots,
        "wind_east_knots": wind_east_knots,
        "wind_north_knots": wind_north_knots,
        "windage_factor": windage_factor,
    }


def generate_prediction_trajectory(
    latitude: float,
    longitude: float,
    speed_knots: float,
    heading_degrees: float,
    prediction_minutes: int = 120,
    interval_minutes: int = 5,
    current_east_knots: float = 0.0,
    current_north_knots: float = 0.0,
    wind_east_knots: float = 0.0,
    wind_north_knots: float = 0.0,
    windage_factor: float = 0.0,
) -> List[Dict[str, float]]:
    """
    Generate an environmentally corrected trajectory.
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
            current_east_knots=current_east_knots,
            current_north_knots=current_north_knots,
            wind_east_knots=wind_east_knots,
            wind_north_knots=wind_north_knots,
            windage_factor=windage_factor,
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
    Calculate a point forward along the vessel heading
    and shifted laterally.
    """

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
    current_east_knots: float = 0.0,
    current_north_knots: float = 0.0,
    wind_east_knots: float = 0.0,
    wind_north_knots: float = 0.0,
    windage_factor: float = 0.0,
) -> Dict[str, object]:
    """
    Generate an environmentally corrected prediction
    trajectory and uncertainty cone.
    """

    trajectory = generate_prediction_trajectory(
        latitude=latitude,
        longitude=longitude,
        speed_knots=speed_knots,
        heading_degrees=heading_degrees,
        prediction_minutes=prediction_minutes,
        interval_minutes=interval_minutes,
        current_east_knots=current_east_knots,
        current_north_knots=current_north_knots,
        wind_east_knots=wind_east_knots,
        wind_north_knots=wind_north_knots,
        windage_factor=windage_factor,
    )

    left_boundary = []
    right_boundary = []

    for point in trajectory:
        forward_distance = point["distance_travelled_km"]
        uncertainty = point["uncertainty_km"]

        heading = point["ground_heading_degrees"]

        left_latitude, left_longitude = destination_point_with_offset(
            latitude=latitude,
            longitude=longitude,
            heading_degrees=heading,
            forward_distance_km=forward_distance,
            lateral_offset_km=-uncertainty,
        )

        right_latitude, right_longitude = destination_point_with_offset(
            latitude=latitude,
            longitude=longitude,
            heading_degrees=heading,
            forward_distance_km=forward_distance,
            lateral_offset_km=uncertainty,
        )

        left_boundary.append(
            [left_longitude, left_latitude]
        )

        right_boundary.append(
            [right_longitude, right_latitude]
        )

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