def calculate_dark_ship_score(
    gap_duration_minutes: float,
    was_dark_at_dump: bool,
    duration_cap_minutes: float = 120.0,
) -> float:
    """
    Calculate Dark Ship Score from 0 to 100.

    60% = duration component
    40% = whether the vessel was dark at dump time
    """

    duration_score = min(
        (gap_duration_minutes / duration_cap_minutes) * 100,
        100,
    )

    temporal_score = 100.0 if was_dark_at_dump else 0.0

    score = (
        0.60 * duration_score
        + 0.40 * temporal_score
    )

    return round(score, 2)


def calculate_spatial_proximity_score(
    distance_km: float,
    scoring_radius_km: float = 50.0,
) -> float:
    """
    Convert distance from spill origin into a 0-100 score.

    0 km      -> 100
    50+ km    -> 0
    """

    score = max(
        0.0,
        100.0 * (1.0 - distance_km / scoring_radius_km),
    )

    return round(score, 2)


def calculate_movement_score(
    robust_z: float,
    z_cap: float = 10.0,
) -> float:
    """
    Convert movement anomaly robust-z score
    into a 0-100 movement behaviour score.
    """

    score = min(
        (robust_z / z_cap) * 100,
        100,
    )

    return round(score, 2)


def calculate_final_score(
    dark_ship_score: float,
    spatial_score: float,
    movement_score: float,
) -> float:
    """
    Calculate the final forensic anomaly score.

    Weights:
        Dark Ship      = 50%
        Spatial        = 35%
        Movement       = 15%
    """

    score = (
        0.50 * dark_ship_score
        + 0.35 * spatial_score
        + 0.15 * movement_score
    )

    return round(score, 2)