-- Enable PostGIS extension (Supabase supports this natively)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Schema for historical and synthetic AIS logs
CREATE TABLE IF NOT EXISTS ais_vessel_positions (
    id BIGSERIAL PRIMARY KEY,
    mmsi INT NOT NULL,
    vessel_name VARCHAR(100) NOT NULL,
    vessel_type VARCHAR(50) DEFAULT 'Cargo',
    timestamp TIMESTAMPTZ NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed_knots REAL NOT NULL,
    heading REAL DEFAULT 0.0,
    -- 4326 = WGS84 standard coordinate reference system (Lat/Lon)
    geom GEOMETRY(Point, 4326) NOT NULL
);

-- 1. Spatial R-Tree Index (Sub-millisecond bounding box searches)
CREATE INDEX IF NOT EXISTS idx_ais_geom ON ais_vessel_positions USING GIST (geom);

-- 2. Temporal B-Tree Index (Enables rapid slicing by estimated spill time window)
CREATE INDEX IF NOT EXISTS idx_ais_timestamp ON ais_vessel_positions (timestamp DESC);

-- 3. Composite Index for trajectory generation (Grouping by MMSI and sorting by time)
CREATE INDEX IF NOT EXISTS idx_ais_mmsi_time ON ais_vessel_positions (mmsi, timestamp ASC);

-- 4. Automatically populate the PostGIS geom column on insert
CREATE OR REPLACE FUNCTION update_ais_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_ais_geom
BEFORE INSERT OR UPDATE ON ais_vessel_positions
FOR EACH ROW
EXECUTE FUNCTION update_ais_geom();