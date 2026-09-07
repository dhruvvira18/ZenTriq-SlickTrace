import os
import numpy as np
from datetime import datetime, timedelta
from opendrift.models.openoil import OpenOil
from opendrift.readers import reader_netCDF_CF_generic, reader_constant

def run_hindcast_simulation(start_lat: float, start_lon: float, detection_time: datetime, hours_back: int = 24):
    naive_detection_time = detection_time.replace(tzinfo=None)
    o = OpenOil(loglevel=50)
    
    readers = []
    
    # 1. Load the exact August 2026 NetCDF ocean currents
    netcdf_path = os.path.join(os.path.dirname(__file__), "..", "data", "metocean", "mumbai_currents.nc")
    if os.path.exists(netcdf_path):
        reader_nc = reader_netCDF_CF_generic.Reader(netcdf_path)
        readers.append(reader_nc)
            
    # 2. OpenOil requires wind data. Since the NetCDF only has uo/vo (currents), 
    # we supply a constant wind reader to prevent missing-variable crashes.
    reader_wind = reader_constant.Reader({'x_wind': 2.0, 'y_wind': 5.0})
    readers.append(reader_wind)
    
    o.add_reader(readers)

    o.seed_elements(
        lon=start_lon,
        lat=start_lat,
        radius=1000, 
        number=1000, 
        time=naive_detection_time
    )

    # Execute reverse simulation
    o.run(
        duration=timedelta(hours=hours_back),
        time_step=timedelta(hours=-1), 
    )

    # 3. Trajectory Extraction (Fixing the AttributeError & Hairball)
    lon_history = o.get_property('lon')[0]
    lat_history = o.get_property('lat')[0]
    
    # Dynamically find the axis containing the 1000 particles
    particle_axis = 1 if lon_history.shape[1] >= 1000 else 0
    
    # Average across the particles to collapse 1000 dots into a single chronological path (length ~25)
    mean_lons = np.nanmean(lon_history, axis=particle_axis)
    mean_lats = np.nanmean(lat_history, axis=particle_axis)
    
    trajectory_path = [[float(lat), float(lon)] for lat, lon in zip(mean_lats, mean_lons)]
    
    # OpenDrift outputs hindcasts backward (T-0 first, T-24 last).
    # Reverse it so the frontend timeline plays chronologically left-to-right.
    trajectory_path.reverse()
    
    dump_time = naive_detection_time - timedelta(hours=hours_back)

    try:
        # Extract the mean vectors across the simulation
        u_sea = float(np.nanmean(o.get_property('x_sea_water_velocity')[0]))
        v_sea = float(np.nanmean(o.get_property('y_sea_water_velocity')[0]))
        u_wind = float(np.nanmean(o.get_property('x_wind')[0]))
        v_wind = float(np.nanmean(o.get_property('y_wind')[0]))
    except Exception:
        u_sea, v_sea, u_wind, v_wind = 0.0, 0.0, 0.0, 0.0

    return {
        "dump_time": dump_time.isoformat() + "Z", 
        "origin_latitude": trajectory_path[0][0],   
        "origin_longitude": trajectory_path[0][1],  
        "trajectory_path": trajectory_path,
        # Send live environment data to the frontend
        "environment": {
            "current_u": u_sea,
            "current_v": v_sea,
            "wind_u": u_wind,
            "wind_v": v_wind
        }
    }