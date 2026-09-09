import math
def extract_coordinates(geojson):
    """
    Extract [longitude, latitude] coordinates
    from the GeoJSON geometry.
    """

    coordinates = []

    def walk(value):

        if isinstance(value, list):

            # A coordinate pair:
            # [longitude, latitude]
            if (
                len(value) >= 2
                and isinstance(value[0], (int, float))
                and isinstance(value[1], (int, float))
            ):
                coordinates.append(
                    (float(value[0]), float(value[1]))
                )

            else:
                for item in value:
                    walk(item)

    for feature in geojson.get("features", []):

        geometry = feature.get("geometry", {})

        walk(
            geometry.get("coordinates", [])
        )

    return coordinates


def calculate_bbox(geojson):

    coordinates = extract_coordinates(geojson)

    if not coordinates:
        return None

    longitudes = [
        point[0]
        for point in coordinates
    ]

    latitudes = [
        point[1]
        for point in coordinates
    ]

    return {
        "min_lon": min(longitudes),
        "min_lat": min(latitudes),
        "max_lon": max(longitudes),
        "max_lat": max(latitudes)
    }


def expand_bbox(bbox, buffer_km):

    center_lat = (
        bbox["min_lat"] +
        bbox["max_lat"]
    ) / 2

    # Approximate conversion
    km_per_degree_lat = 111.32

    km_per_degree_lon = (
        111.32 *
        max(
            math.cos(math.radians(center_lat)),
            0.15
        )
    )

    lat_buffer = (
        buffer_km /
        km_per_degree_lat
    )

    lon_buffer = (
        buffer_km /
        km_per_degree_lon
    )

    return {
        "min_lon":
            bbox["min_lon"] - lon_buffer,

        "min_lat":
            bbox["min_lat"] - lat_buffer,

        "max_lon":
            bbox["max_lon"] + lon_buffer,

        "max_lat":
            bbox["max_lat"] + lat_buffer
    }