from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parents[1]

load_dotenv(PROJECT_ROOT / ".env")

DATABASE_URL = __import__("os").getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not found in .env")


# Current demo spill event
DUMP_TIME = "2026-08-28 10:00:00+00"
SPILL_LATITUDE = 18.9398
SPILL_LONGITUDE = 71.8880


# ---------------------------------------------------------
# Database connection
# ---------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


# ---------------------------------------------------------
# Refresh database tables
# ---------------------------------------------------------

def refresh_trajectories(connection):
    print("→ Rebuilding vessel_trajectories...")

    connection.execute(text("""
        TRUNCATE TABLE vessel_trajectories RESTART IDENTITY;

        WITH ordered AS (
            SELECT
                id,
                mmsi,
                vessel_name,
                vessel_type,
                timestamp,
                geom,
                LAG(timestamp) OVER (
                    PARTITION BY mmsi
                    ORDER BY timestamp
                ) AS previous_timestamp
            FROM ais_vessel_positions
        ),
        marked AS (
            SELECT
                *,
                CASE
                    WHEN previous_timestamp IS NULL THEN 1
                    WHEN EXTRACT(
                        EPOCH FROM (timestamp - previous_timestamp)
                    ) / 60.0 > 30 THEN 1
                    ELSE 0
                END AS new_segment
            FROM ordered
        ),
        segmented AS (
            SELECT
                *,
                SUM(new_segment) OVER (
                    PARTITION BY mmsi
                    ORDER BY timestamp
                    ROWS UNBOUNDED PRECEDING
                ) AS segment_id
            FROM marked
        )
        INSERT INTO vessel_trajectories (
            mmsi,
            vessel_name,
            vessel_type,
            segment_id,
            segment_start,
            segment_end,
            ais_points,
            trajectory,
            trajectory_length_km
        )
        SELECT
            mmsi,
            vessel_name,
            vessel_type,
            segment_id::integer,
            MIN(timestamp),
            MAX(timestamp),
            COUNT(*)::integer,
            ST_MakeLine(
                geom ORDER BY timestamp
            )::geometry(LineString, 4326),
            ST_Length(
                ST_Transform(
                    ST_MakeLine(geom ORDER BY timestamp),
                    3857
                )
            ) / 1000.0
        FROM segmented
        GROUP BY
            mmsi,
            vessel_name,
            vessel_type,
            segment_id;
    """))

    print("  ✓ vessel_trajectories rebuilt")


def refresh_dark_gaps(connection):
    print("→ Rebuilding vessel_dark_gaps...")

    connection.execute(text("""
        TRUNCATE TABLE vessel_dark_gaps RESTART IDENTITY;

        WITH ordered AS (
            SELECT
                mmsi,
                vessel_name,
                vessel_type,
                timestamp,
                geom,
                LAG(timestamp) OVER (
                    PARTITION BY mmsi
                    ORDER BY timestamp
                ) AS previous_timestamp,
                LAG(geom) OVER (
                    PARTITION BY mmsi
                    ORDER BY timestamp
                ) AS previous_geom
            FROM ais_vessel_positions
        )
        INSERT INTO vessel_dark_gaps (
            mmsi,
            vessel_name,
            vessel_type,
            gap_start,
            gap_end,
            gap_duration_minutes,
            last_known_position,
            next_known_position
        )
        SELECT
            mmsi,
            vessel_name,
            vessel_type,
            previous_timestamp,
            timestamp,
            EXTRACT(
                EPOCH FROM (timestamp - previous_timestamp)
            ) / 60.0,
            previous_geom,
            geom
        FROM ordered
        WHERE previous_timestamp IS NOT NULL
          AND EXTRACT(
              EPOCH FROM (timestamp - previous_timestamp)
          ) / 60.0 > 30;
    """))

    print("  ✓ vessel_dark_gaps rebuilt")


def refresh_spatial_scores(connection):
    print("→ Rebuilding vessel_spatial_scores...")

    connection.execute(text("""
        TRUNCATE TABLE vessel_spatial_scores RESTART IDENTITY;

        WITH params AS (
            SELECT
                CAST(:dump_time AS timestamptz) AS dump_time,
                ST_SetSRID(
                    ST_MakePoint(
                        :spill_longitude,
                        :spill_latitude
                    ),
                    4326
                )::geometry(Point, 4326) AS spill_point
        ),

        dark_vessels AS (
            SELECT DISTINCT ON (dg.mmsi)
                dg.mmsi,
                dg.vessel_name,
                p.dump_time,

                LEAST(
                    ST_Distance(
                        dg.last_known_position::geography,
                        p.spill_point::geography
                    ),
                    ST_Distance(
                        dg.next_known_position::geography,
                        p.spill_point::geography
                    )
                ) / 1000.0 AS distance_to_spill_km,

                TRUE AS was_dark_at_dump

            FROM vessel_dark_gaps dg
            CROSS JOIN params p

            WHERE dg.gap_start <= p.dump_time
              AND dg.gap_end >= p.dump_time

            ORDER BY
                dg.mmsi,
                dg.gap_duration_minutes DESC
        ),

        normal_vessels AS (
            SELECT DISTINCT ON (a.mmsi)
                a.mmsi,
                a.vessel_name,
                p.dump_time,

                ST_Distance(
                    a.geom::geography,
                    p.spill_point::geography
                ) / 1000.0 AS distance_to_spill_km,

                FALSE AS was_dark_at_dump

            FROM ais_vessel_positions a
            CROSS JOIN params p

            WHERE NOT EXISTS (
                SELECT 1
                FROM dark_vessels d
                WHERE d.mmsi = a.mmsi
            )

            ORDER BY
                a.mmsi,
                ABS(
                    EXTRACT(
                        EPOCH FROM (
                            a.timestamp - p.dump_time
                        )
                    )
                )
        ),

        combined AS (
            SELECT *
            FROM dark_vessels

            UNION ALL

            SELECT *
            FROM normal_vessels
        )

        INSERT INTO vessel_spatial_scores (
            mmsi,
            vessel_name,
            dump_time,
            distance_to_spill_km,
            was_dark_at_dump,
            spatial_proximity_score
        )
        SELECT
            mmsi,
            vessel_name,
            dump_time,
            distance_to_spill_km,
            was_dark_at_dump,

            GREATEST(
                0.0,
                100.0 * EXP(
                    -distance_to_spill_km / 50.0
                )
            )::real

        FROM combined;
    """), {
        "dump_time": DUMP_TIME,
        "spill_latitude": SPILL_LATITUDE,
        "spill_longitude": SPILL_LONGITUDE,
    })

    print("  ✓ vessel_spatial_scores rebuilt")


def refresh_forensic_scores(connection):
    print("→ Rebuilding vessel_forensic_scores...")

    connection.execute(text("""
        TRUNCATE TABLE vessel_forensic_scores RESTART IDENTITY;

        WITH scores AS (
            SELECT
                s.mmsi,
                s.vessel_name,
                s.spatial_proximity_score,

                COALESCE(
                    100.0 * (
                        1.0 - EXP(-m.max_robust_z / 10.0)
                    ),
                    0.0
                ) AS movement_score,

                COALESCE(
                    (
                        SELECT
                            LEAST(
                                100.0 * (
                                    0.70 * (
                                        1.0 - EXP(
                                            -dg.gap_duration_minutes / 60.0
                                        )
                                    )
                                    +
                                    0.30
                                ),
                                100.0
                            )
                        FROM vessel_dark_gaps dg
                        WHERE dg.mmsi = s.mmsi
                        AND s.dump_time >= dg.gap_start
                        AND s.dump_time <= dg.gap_end
                        ORDER BY dg.gap_duration_minutes DESC
                        LIMIT 1
                    ),
                    0.0
                ) AS dark_ship_score

            FROM vessel_spatial_scores s

            LEFT JOIN vessel_movement_scores m
                ON m.mmsi = s.mmsi
        ),

        calculated AS (
            SELECT
                *,
                (
                    0.50 * dark_ship_score
                    +
                    0.35 * spatial_proximity_score
                    +
                    0.15 * movement_score
                ) AS final_score
            FROM scores
        )

        INSERT INTO vessel_forensic_scores (
            mmsi,
            vessel_name,
            dark_ship_score,
            spatial_proximity_score,
            movement_score,
            final_score,
            rank
        )

        SELECT
            mmsi,
            vessel_name,
            dark_ship_score::real,
            spatial_proximity_score::real,
            movement_score::real,
            final_score::real,
            ROW_NUMBER() OVER (
                ORDER BY final_score DESC
            )::integer
        FROM calculated;
    """))

    print("  ✓ vessel_forensic_scores rebuilt")

# ---------------------------------------------------------
# Verification
# ---------------------------------------------------------

def verify_results(connection):
    print("\n" + "=" * 60)
    print("FORENSIC DATABASE REFRESH COMPLETE")
    print("=" * 60)

    result = connection.execute(text("""
        SELECT
            rank,
            vessel_name,
            ROUND(dark_ship_score::numeric, 2) AS dark_ship,
            ROUND(spatial_proximity_score::numeric, 2) AS spatial,
            ROUND(movement_score::numeric, 2) AS movement,
            ROUND(final_score::numeric, 2) AS final
        FROM vessel_forensic_scores
        ORDER BY rank;
    """))

    print(
        f"{'Rank':<6}"
        f"{'Vessel':<28}"
        f"{'Dark':<10}"
        f"{'Spatial':<10}"
        f"{'Movement':<10}"
        f"{'Final':<10}"
    )

    print("-" * 74)

    for row in result:
        print(
            f"{row.rank:<6}"
            f"{row.vessel_name:<28}"
            f"{float(row.dark_ship):<10.2f}"
            f"{float(row.spatial):<10.2f}"
            f"{float(row.movement):<10.2f}"
            f"{float(row.final):<10.2f}"
        )

    print("=" * 60)


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main():
    print("\nStarting forensic table refresh...\n")

    with engine.begin() as connection:
        refresh_trajectories(connection)
        refresh_dark_gaps(connection)

        # Movement scores are intentionally NOT rebuilt.
        print("→ Keeping vessel_movement_scores unchanged")
        print("  ✓ movement scores preserved")

        refresh_spatial_scores(connection)
        refresh_forensic_scores(connection)

        verify_results(connection)


if __name__ == "__main__":
    main()