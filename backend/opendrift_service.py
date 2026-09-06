import os
import numpy as np
from datetime import datetime, timedelta
from opendrift.models.openoil import OpenOil
from opendrift.readers import reader_netCDF_CF_generic, reader_constant

def run_hindcast_simulation(start_lat: float, start_lon: float, detection_time: datetime, hours_back: int = 24):
    naive_detection_time = detection_time.replace(tzinfo=None)
    o = OpenOil(loglevel=50)
    
    readers = []
    
    # 1. Real Mumbai currents (Priority 1)
    netcdf_path = os.path.join(os.path.dirname(__file__), "..", "data", "metocean", "mumbai_currents.nc")
    if os.path.exists(netcdf_path):
        try:
            reader_nc = reader_netCDF_CF_generic.Reader(netcdf_path)
            readers.append(reader_nc)
        except Exception:
            pass
            
    # 2. Fallback currents and constant wind (Priority 2)
    reader_currents_fallback = reader_constant.Reader({'x_sea_water_velocity': 0.5, 'y_sea_water_velocity': 0.1})
    reader_wind = reader_constant.Reader({'x_wind': 2.0, 'y_wind': 5.0})
    
    readers.extend([reader_currents_fallback, reader_wind])
    
    # OpenDrift queries readers in the order they are added
    o.add_reader(readers)

    o.seed_elements(
        lon=start_lon,
        lat=start_lat,
        radius=1000, 
        number=1000, 
        time=naive_detection_time
    )

    o.run(
        duration=timedelta(hours=hours_back),
        time_step=timedelta(hours=-1), 
    )

    # 3. Extract final coordinates directly from the active elements
    lons = o.elements.lon
    lats = o.elements.lat
    
    dump_time = naive_detection_time - timedelta(hours=hours_back)

    return {
        "dump_time": dump_time.isoformat() + "Z", 
        "origin_latitude": float(np.nanmean(lats)),
        "origin_longitude": float(np.nanmean(lons))
    }