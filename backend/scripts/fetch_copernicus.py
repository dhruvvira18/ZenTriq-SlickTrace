"""
ZenTriq-SlickTrace: Metocean Data Fetcher
Downloads subsetted NetCDF ocean current vectors via Copernicus Marine API.
"""

import os
import copernicusmarine
from dotenv import load_dotenv

# Explicitly point to the backend env file when running from project root
load_dotenv("backend/.env")

def fetch_metocean_data():
    output_dir = "data/metocean"
    os.makedirs(output_dir, exist_ok=True)
    
    # Define exact output path
    output_filename = "mumbai_currents.nc"
    output_filepath = os.path.join(output_dir, output_filename)
    
    # Safely delete the file if it already exists to prevent overwrite conflicts
    if os.path.exists(output_filepath):
        os.remove(output_filepath)
    
    # Bounding box for Mumbai Offshore / Arabian Sea Shipping Channel
    min_lon, max_lon = 71.0, 73.0
    min_lat, max_lat = 18.0, 20.0
    
    # Time window encompassing the synthetic AIS trajectory
    start_datetime = "2026-08-28 00:00:00"
    end_datetime = "2026-08-30 00:00:00"
    
    print("[*] Authenticating and requesting Copernicus NetCDF subset...")
    
    copernicusmarine.subset(
        dataset_id="cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i",
        variables=["uo", "vo"],  
        minimum_longitude=min_lon,
        maximum_longitude=max_lon,
        minimum_latitude=min_lat,
        maximum_latitude=max_lat,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        minimum_depth=0.49,
        maximum_depth=0.5,       
        output_filename=output_filename,
        output_directory=output_dir,
        username=os.getenv("COPERNICUS_USERNAME"),
        password=os.getenv("COPERNICUS_PASSWORD")
    )
    
    print(f"[SUCCESS] NetCDF matrix saved successfully to {output_filepath}")

if __name__ == "__main__":
    fetch_metocean_data()