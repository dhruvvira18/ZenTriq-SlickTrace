from typing import Dict, Any

from .predictor import generate_probability_cone


def build_prediction_geojson(
    latitude: float,
    longitude: float,
    speed_knots: float,
    heading_degrees: float,
    prediction_minutes: int = 120,
    interval_minutes: int = 5,
) -> Dict[str, Any]:
    """
    Build a GeoJSON FeatureCollection containing:

    1. Last known vessel position
    2. Predicted vessel trajectory
    3. Prediction uncertainty cone
    """

    prediction = generate_probability_cone(
        latitude=latitude,
        longitude=longitude,
        speed_knots=speed_knots,
        heading_degrees=heading_degrees,
        prediction_minutes=prediction_minutes,
        interval_minutes=interval_minutes,
    )

    trajectory_coordinates = [
        [
            point["longitude"],
            point["latitude"],
        ]
        for point in prediction["trajectory"]
    ]

    features = [
        {
            "type": "Feature",
            "properties": {
                "type": "last_known_position",
            },
            "geometry": {
                "type": "Point",
                "coordinates": [
                    longitude,
                    latitude,
                ],
            },
        },
        {
            "type": "Feature",
            "properties": {
                "type": "predicted_trajectory",
                "speed_knots": speed_knots,
                "heading_degrees": heading_degrees,
                "prediction_minutes": prediction_minutes,
            },
            "geometry": {
                "type": "LineString",
                "coordinates": trajectory_coordinates,
            },
        },
        {
            "type": "Feature",
            "properties": {
                "type": "prediction_uncertainty_cone",
                "prediction_minutes": prediction_minutes,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    prediction["polygon"]
                ],
            },
        },
    ]

    return {
        "type": "FeatureCollection",
        "features": features,
    }