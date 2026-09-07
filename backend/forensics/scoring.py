import math


def calculate_dark_ship_score(
    gap_duration_minutes: float,
    was_dark_at_dump: bool,
) -> float:
    """
    Calculate Dark Ship Score from 0 to 100.

    Uses diminishing returns for longer AIS gaps so that
    even a very strong gap does not automatically produce 100.

    Components:
        70% = gap duration
        30% = whether vessel was dark at dump time
    """

    # Longer gaps provide stronger evidence, but with diminishing returns.
    duration_score = 100.0 * (
        1.0 - math.exp(-gap_duration_minutes / 60.0)
    )

    temporal_score = 100.0 if was_dark_at_dump else 0.0

    score = (
        0.70 * duration_score
        + 0.30 * temporal_score
    )

    return round(min(score, 100.0), 2)


def calculate_spatial_proximity_score(
    distance_km: float,
    scoring_radius_km: float = 50.0,
) -> float:
    """
    Convert distance from spill origin into a 0-100 score.

    Uses a smooth exponential decay rather than a hard linear
    relationship.
    """

    score = 100.0 * math.exp(
        -distance_km / scoring_radius_km
    )

    return round(max(0.0, min(score, 100.0)), 2)


def calculate_movement_score(
    robust_z: float,
) -> float:
    """
    Convert movement anomaly robust-z score into a 0-100 score.

    Uses diminishing returns so extreme anomalies remain strong
    without automatically becoming 100.
    """

    score = 100.0 * (
        1.0 - math.exp(-robust_z / 10.0)
    )

    return round(max(0.0, min(score, 100.0)), 2)


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