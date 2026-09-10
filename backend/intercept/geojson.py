from typing import Dict, Any

from .predictor import generate_probability_cone
from .solver import calculate_intercept


def build_prediction_geojson(
    latitude: float,
    longitude: float,
    speed_knots: float,
    heading_degrees: float,
    prediction_minutes: int = 120,
    interval_minutes: int = 5,
    asset_latitude: float | None = None,
    asset_longitude: float | None = None,
    asset_speed_knots: float | None = None,
) -> Dict[str, Any]:
    """
    Build a GeoJSON FeatureCollection containing:

    1. Last known vessel position
    2. Predicted vessel trajectory
    3. Prediction uncertainty cone
    4. Response asset position
    5. Intercept route
    6. Intercept point

    The intercept features are only included when a response
    asset is supplied.
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

    intercept = None

    # ---------------------------------------------------------
    # INTERCEPT CALCULATION
    # ---------------------------------------------------------

    if (
        asset_latitude is not None
        and asset_longitude is not None
        and asset_speed_knots is not None
    ):

        intercept_trajectory = [
            {
                "latitude": point["latitude"],
                "longitude": point["longitude"],
                "minutes_ahead": point["minutes_ahead"],
            }
            for point in prediction["trajectory"]
        ]

        intercept = calculate_intercept(
            asset_latitude=asset_latitude,
            asset_longitude=asset_longitude,
            asset_speed_knots=asset_speed_knots,
            trajectory=intercept_trajectory,
        )

        # -----------------------------------------------------
        # RESPONSE ASSET
        # -----------------------------------------------------

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "type": "response_asset",
                    "name": "Coast Guard Asset — Mumbai",
                    "speed_knots": asset_speed_knots,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [
                        asset_longitude,
                        asset_latitude,
                    ],
                },
            }
        )

        # -----------------------------------------------------
        # INTERCEPT ROUTE + POINT
        # -----------------------------------------------------

        if intercept is not None:

            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "type": "intercept_route",
                        "course_degrees": intercept[
                            "asset_course_degrees"
                        ],
                        "distance_km": intercept[
                            "distance_from_asset_km"
                        ],
                        "travel_minutes": intercept[
                            "asset_travel_minutes"
                        ],
                    },
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [
                                asset_longitude,
                                asset_latitude,
                            ],
                            [
                                intercept["longitude"],
                                intercept["latitude"],
                            ],
                        ],
                    },
                }
            )

            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "type": "intercept_point",
                        "eta_minutes": intercept[
                            "minutes_ahead"
                        ],
                        "distance_km": intercept[
                            "distance_from_asset_km"
                        ],
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [
                            intercept["longitude"],
                            intercept["latitude"],
                        ],
                    },
                }
            )

    response = {
        "type": "FeatureCollection",
        "features": features,
    }

    # Keep the numerical intercept result available to the API
    # without putting non-GeoJSON data inside the FeatureCollection.
    if intercept is not None:
        response["intercept"] = intercept

    return response