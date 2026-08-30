"""
ZenTriq-SlickTrace: AIS Trajectory Simulation Engine
Generates synthetic spatio-temporal vessel trajectories across Mumbai Offshore corridor.
"""

import os
import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine
from dotenv import load_dotenv

load_dotenv()

# Bounding Box: Mumbai Offshore / Arabian Sea Shipping Channel
# Latitudes: 18.4°N to 19.4°N | Longitudes: 71.2°E to 72.6°E
BASE_TIME = datetime(2026, 8, 29, 0, 0, 0, tzinfo=timezone.utc)

def calculate_heading(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates forward azimuth heading angle between two geographic coordinates."""
    d_lon = math.radians(lon2 - lon1)
    y = math.sin(d_lon) * math.cos(math.radians(lat2))
    x = math.cos(math.radians(lat1)) * math.sin(math.radians(lat2)) - \
        math.sin(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.cos(d_lon)
    initial_bearing = math.atan2(y, x)
    return (math.degrees(initial_bearing) + 360) % 360

def generate_vessel_trajectory(
    mmsi: int,
    name: str,
    vessel_type: str,
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    start_time: datetime,
    duration_hours: float,
    ping_interval_minutes: int = 5,
    speed_drop_window: tuple = None,  # (start_min, end_min, dropped_speed)
    dark_gap_window: tuple = None     # (start_min, end_min)
) -> list:
    """
    Interpolates a realistic vessel track with speed variations and intentional AIS gaps.
    """
    records = []
    total_steps = int((duration_hours * 60) / ping_interval_minutes)
    
    # Linear interpolation of geographic path
    lats = np.linspace(start_lat, end_lat, total_steps)
    lons = np.linspace(start_lon, end_lon, total_steps)
    
    default_heading = calculate_heading(start_lat, start_lon, end_lat, end_lon)
    
    for i in range(total_steps):
        elapsed_minutes = i * ping_interval_minutes
        current_time = start_time + timedelta(minutes=elapsed_minutes)
        
        # 1. Check for Dark Ship Transponder Gap (AIS Disabled)
        if dark_gap_window and (dark_gap_window[0] <= elapsed_minutes <= dark_gap_window[1]):
            continue  # Ship transponder turned off - no pings emitted
        
        # 2. Check for Speed Drop Anomaly (Discharge Event)
        if speed_drop_window and (speed_drop_window[0] <= elapsed_minutes <= speed_drop_window[1]):
            current_speed = speed_drop_window[2] + np.random.uniform(-0.3, 0.3)
        else:
            current_speed = 14.2 + np.random.uniform(-0.5, 0.5)  # Normal cruising speed
        
        lat = float(lats[i]) + np.random.normal(0, 0.0005)  # Small GPS drift noise
        lon = float(lons[i]) + np.random.normal(0, 0.0005)
        
        records.append({
            "mmsi": mmsi,
            "vessel_name": name,
            "vessel_type": vessel_type,
            "timestamp": current_time,
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "speed_knots": round(float(current_speed), 2),
            "heading": round(float(default_heading), 2)
        })
        
    return records

def build_dataset() -> pd.DataFrame:
    all_pings = []
    
    # --------------------------------------------------------------------------
    # VESSEL 1: The Culprit ("MV Ocean Phoenix" - Crude Oil Tanker)
    # Profile: Crosses spill origin at 08:30 UTC. Slows to 2.4 knots. Goes dark for 2 hrs.
    # --------------------------------------------------------------------------
    all_pings.extend(generate_vessel_trajectory(
        mmsi=413289000,
        name="MV Ocean Phoenix",
        vessel_type="Crude Oil Tanker",
        start_lat=18.6000, start_lon=71.3000,
        end_lat=19.3000, end_lon=72.4000,
        start_time=BASE_TIME + timedelta(hours=4),
        duration_hours=12,
        ping_interval_minutes=5,
        speed_drop_window=(180, 300, 2.4),  # Drops speed to 2.4 knots between hr 7 and 9
        dark_gap_window=(210, 330)         # AIS disabled between 07:30 and 09:30 UTC
    ))
    
    # --------------------------------------------------------------------------
    # VESSEL 2: Innocent Bypass ("CMA CGM Mumbai" - Ultra Large Container)
    # Profile: Fast transit at 19.5 knots. Constant speed, zero transponder dropouts.
    # --------------------------------------------------------------------------
    all_pings.extend(generate_vessel_trajectory(
        mmsi=228392000,
        name="CMA CGM Mumbai",
        vessel_type="Container Ship",
        start_lat=18.4500, start_lon=71.4000,
        end_lat=19.2000, end_lon=72.5500,
        start_time=BASE_TIME + timedelta(hours=6),
        duration_hours=8,
        ping_interval_minutes=5
    ))

    # --------------------------------------------------------------------------
    # VESSEL 3: Innocent Loiterer ("Sagar Samrat Support" - Offshore Tug)
    # Profile: Operates at low speeds (3-5 knots) near Mumbai High, but far from spill box.
    # --------------------------------------------------------------------------
    all_pings.extend(generate_vessel_trajectory(
        mmsi=563091000,
        name="Sagar Samrat Support",
        vessel_type="Tug/Supply Vessel",
        start_lat=19.3500, start_lon=71.2500,
        end_lat=19.4200, end_lon=71.3500,
        start_time=BASE_TIME,
        duration_hours=18,
        ping_interval_minutes=10,
        speed_drop_window=(0, 1080, 3.8)
    ))

    return pd.DataFrame(all_pings)

def main():
    print("[*] Generating synthetic AIS trajectory dataset...")
    df = build_dataset()
    
    # 1. Save local CSV backup
    os.makedirs("data/ais", exist_ok=True)
    csv_path = "data/ais/mumbai_synthetic_ais.csv"
    df.to_csv(csv_path, index=False)
    print(f"[+] Saved {len(df)} records locally to: {csv_path}")
    
    # 2. Direct Ingestion to Supabase
    db_url = os.getenv("DIRECT_DATABASE_URL")
    if not db_url:
        print("[!] DIRECT_DATABASE_URL not found in .env. Skipping database upload.")
        return
        
    print("[*] Connecting to Supabase PostGIS...")
    # The connect_args forces SSL, preventing connection drops
    engine = create_engine(db_url, connect_args={'sslmode': 'require'})
    
    # Append records to table (PostGIS trigger automatically calculates geom)
    df.to_sql("ais_vessel_positions", engine, if_exists="append", index=False, method="multi", chunksize=1000)
    print(f"[SUCCESS] Ingested {len(df)} AIS points directly into Supabase 'ais_vessel_positions' table.")

if __name__ == "__main__":
    main()