from predictor import (
    predict_vessel_position,
    generate_prediction_trajectory,
)
from predictor import generate_probability_cone

# MV Ocean Phoenix
latitude = 18.9398
longitude = 71.8880
speed_knots = 12.0
heading_degrees = 47.0


print("\n=== PREDICTIVE INTERCEPT TEST ===")
print("Vessel: MV Ocean Phoenix")
print(f"Last known position: {latitude}, {longitude}")
print(f"Speed: {speed_knots} kn")
print(f"Heading: {heading_degrees}°")


for minutes in [30, 60, 120]:
    result = predict_vessel_position(
        latitude=latitude,
        longitude=longitude,
        speed_knots=speed_knots,
        heading_degrees=heading_degrees,
        minutes_ahead=minutes,
    )

    print(f"\nT + {minutes} minutes")
    print(
        f"  Position: "
        f"{result['latitude']:.5f}, "
        f"{result['longitude']:.5f}"
    )
    print(
        f"  Distance travelled: "
        f"{result['distance_travelled_km']:.2f} km"
    )
    print(
        f"  Uncertainty radius: "
        f"±{result['uncertainty_km']:.2f} km"
    )


print("\n=== TRAJECTORY ===")

trajectory = generate_prediction_trajectory(
    latitude=latitude,
    longitude=longitude,
    speed_knots=speed_knots,
    heading_degrees=heading_degrees,
    prediction_minutes=120,
    interval_minutes=30,
)

for point in trajectory:
    print(
        f"T+{point['minutes_ahead']:3} min → "
        f"{point['latitude']:.5f}, "
        f"{point['longitude']:.5f} "
        f"(±{point['uncertainty_km']:.2f} km)"
    )

print("\n=== PROBABILITY CONE ===")

cone = generate_probability_cone(
    latitude=latitude,
    longitude=longitude,
    speed_knots=speed_knots,
    heading_degrees=heading_degrees,
    prediction_minutes=120,
    interval_minutes=30,
)

print(
    f"Trajectory points: "
    f"{len(cone['trajectory'])}"
)

print(
    f"Left boundary points: "
    f"{len(cone['left_boundary'])}"
)

print(
    f"Right boundary points: "
    f"{len(cone['right_boundary'])}"
)

print(
    f"Polygon points: "
    f"{len(cone['polygon'])}"
)

print("\nFirst polygon point:")
print(cone["polygon"][0])

print("\nLast polygon point:")
print(cone["polygon"][-1])