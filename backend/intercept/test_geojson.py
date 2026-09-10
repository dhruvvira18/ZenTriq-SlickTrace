from .geojson import build_prediction_geojson


def test_prediction_without_intercept():

    result = build_prediction_geojson(
        latitude=18.9398,
        longitude=71.8880,
        speed_knots=12,
        heading_degrees=47,
    )

    assert result["type"] == "FeatureCollection"
    assert len(result["features"]) == 3

    feature_types = [
        feature["properties"]["type"]
        for feature in result["features"]
    ]

    assert "last_known_position" in feature_types
    assert "predicted_trajectory" in feature_types
    assert "prediction_uncertainty_cone" in feature_types

    print("✓ Normal prediction test passed")


def test_prediction_with_intercept():

    result = build_prediction_geojson(
        latitude=18.9689,
        longitude=71.95306,
        speed_knots=12,
        heading_degrees=47,
        prediction_minutes=120,
        interval_minutes=5,

        # Prototype Coast Guard asset position.
        asset_latitude=18.90,
        asset_longitude=72.80,
        asset_speed_knots=20,
    )

    assert result["type"] == "FeatureCollection"

    feature_types = [
        feature["properties"]["type"]
        for feature in result["features"]
    ]

    assert "last_known_position" in feature_types
    assert "predicted_trajectory" in feature_types
    assert "prediction_uncertainty_cone" in feature_types
    assert "response_asset" in feature_types

    if "intercept_route" in feature_types:

        assert "intercept_point" in feature_types
        assert "intercept" in result

        intercept = result["intercept"]

        assert "latitude" in intercept
        assert "longitude" in intercept
        assert "minutes_ahead" in intercept
        assert "asset_travel_minutes" in intercept
        assert "asset_course_degrees" in intercept

        print("✓ Intercept calculation test passed")
        print(
            f"  Intercept point: "
            f"{intercept['latitude']:.4f}, "
            f"{intercept['longitude']:.4f}"
        )
        print(
            f"  ETA: "
            f"{intercept['minutes_ahead']} min"
        )
        print(
            f"  Asset travel time: "
            f"{intercept['asset_travel_minutes']} min"
        )
        print(
            f"  Course: "
            f"{intercept['asset_course_degrees']}°"
        )

    else:
        print("⚠ No feasible intercept found")


if __name__ == "__main__":

    print("\n=== GEOJSON INTERCEPT TEST ===\n")

    test_prediction_without_intercept()
    test_prediction_with_intercept()

    print("\nAll GeoJSON tests completed ✓")