import xarray as xr

def inspect_metocean_data():
    file_path = "data/metocean/mumbai_currents.nc"
    
    try:
        # Load the binary NetCDF file into an xarray Dataset
        ds = xr.open_dataset(file_path)
        
        print("\n[+] NETCDF FILE SUCCESSFULLY LOADED")
        print("="*50)
        
        print("\n1. GLOBAL DIMENSIONS (The Shape of the Matrix):")
        print(ds.dims)
        
        print("\n2. COORDINATES (The Grid Labels):")
        print(ds.coords)
        
        print("\n3. DATA VARIABLES (The Physics Vectors):")
        for var_name in ds.data_vars:
            var_data = ds[var_name]
            print(f" - {var_name}: {var_data.attrs.get('long_name', 'No description')} ({var_data.attrs.get('units', '')})")
            
    except Exception as e:
        print(f"[!] Error reading file: {e}")

if __name__ == "__main__":
    inspect_metocean_data()