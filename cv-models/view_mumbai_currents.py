import xarray as xr

# Open the dataset
ds = xr.open_dataset('data/metocean/mumbai_currents.nc')

# Print file contents and metadata summary
print(ds)
