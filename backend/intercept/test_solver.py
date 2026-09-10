from .solver import calculate_intercept


def test_intercept_is_found():

    trajectory = [
        {
            "latitude": 18.95,
            "longitude": 72.75,
            "minutes_ahead": 30,
        },
        {
            "latitude": 19.00,
            "longitude": 72.70,
            "minutes_ahead": 60,
        },
        {
            "latitude": 19.05,
            "longitude": 72.65,
            "minutes_ahead": 90,
        },
    ]

    result = calculate_intercept(
        asset_latitude=18.90,
        asset_longitude=72.80,
        asset_speed_knots=20,
        trajectory=trajectory,
    )

    assert result is not None
    assert "latitude" in result
    assert "longitude" in result
    assert "asset_travel_minutes" in result
    assert "asset_course_degrees" in result

    print("✓ Intercept feasibility test passed")
    print(
        f"  Intercept point: "
        f"{result['latitude']:.4f}, "
        f"{result['longitude']:.4f}"
    )
    print(
        f"  Target time: "
        f"{result['minutes_ahead']} min"
    )
    print(
        f"  Asset travel time: "
        f"{result['asset_travel_minutes']} min"
    )
    print(
        f"  Asset course: "
        f"{result['asset_course_degrees']}°"
    )


def test_intercept_impossible():

    trajectory = [
        {
            "latitude": 20.00,
            "longitude": 74.00,
            "minutes_ahead": 30,
        }
    ]

    result = calculate_intercept(
        asset_latitude=18.90,
        asset_longitude=72.80,
        asset_speed_knots=5,
        trajectory=trajectory,
    )

    assert result is None

    print("✓ Impossible intercept test passed")


if __name__ == "__main__":

    print("\nRunning intercept solver tests...\n")

    test_intercept_is_found()
    test_intercept_impossible()

    print("\nAll intercept solver tests passed ✓")