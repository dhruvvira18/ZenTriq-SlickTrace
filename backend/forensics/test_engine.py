from datetime import datetime, timezone

from engine import run_forensic_analysis


if __name__ == "__main__":

    result = run_forensic_analysis(
        dump_time=datetime(
            2026,
            8,
            29,
            8,
            30,
            tzinfo=timezone.utc,
        ),
        origin_latitude=18.86,
        origin_longitude=71.70,
    )

    print("\n=== FORENSIC ANALYSIS ===")

    print("\nDump Time:")
    print(result["dump_time"])

    print("\nOrigin:")
    print(result["origin"])

    print("\n=== VESSEL RANKING ===")

    for vessel in result["vessels"]:

        print(
            f"\nRank #{vessel['rank']}"
        )

        print(
            f"Vessel: {vessel['vessel_name']}"
        )

        print(
            f"MMSI: {vessel['mmsi']}"
        )

        print(
            f"Type: {vessel['vessel_type']}"
        )

        print(
            f"Dark Ship Score: "
            f"{vessel['dark_ship_score']:.2f}"
        )

        print(
            f"Spatial Score: "
            f"{vessel['spatial_score']:.2f}"
        )

        print(
            f"Movement Score: "
            f"{vessel['movement_score']:.2f}"
        )

        print(
            f"Final Score: "
            f"{vessel['final_score']:.2f}"
        )

        print(
            f"Dark at Dump: "
            f"{vessel['was_dark_at_dump']}"
        )

        print(
            f"Distance: "
            f"{vessel['distance_to_spill_km']:.2f} km"
            if vessel["distance_to_spill_km"] is not None
            else "Distance: N/A"
        )