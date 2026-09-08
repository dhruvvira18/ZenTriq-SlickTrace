import json

from geojson import build_prediction_geojson


result = build_prediction_geojson(
    latitude=18.9398,
    longitude=71.8880,
    speed_knots=12.0,
    heading_degrees=47.0,
    prediction_minutes=120,
    interval_minutes=30,
)


print("\n=== GEOJSON TEST ===")

print("Type:", result["type"])
print("Features:", len(result["features"]))

for feature in result["features"]:
    print(
        f'{feature["properties"]["type"]}: '
        f'{feature["geometry"]["type"]}'
    )


print("\n=== GEOJSON OUTPUT ===")
print(json.dumps(result, indent=2))