import rasterio
from rasterio.transform import from_origin
import numpy as np
from PIL import Image

def convert_to_geotiff(input_image_path, output_tif_path, top_left_lon, top_left_lat):
    # 1. Load the mock dataset JPEG
    img = Image.open(input_image_path).convert('L') # 'L' for grayscale SAR
    img_array = np.array(img)
    
    # 2. Create the spatial transform (Anchor at Lon/Lat, pixel size ~11 meters)
    transform = from_origin(top_left_lon, top_left_lat, 0.0001, 0.0001)
    
    # 3. Export as a valid GeoTIFF
    with rasterio.open(
        output_tif_path,
        'w',
        driver='GTiff',
        height=img_array.shape[0],
        width=img_array.shape[1],
        count=1,
        dtype=img_array.dtype,
        crs='EPSG:4326', # Standard WGS84 GPS coordinates
        transform=transform,
    ) as dst:
        dst.write(img_array, 1)

# Generate the Class_1 (Spill) demo file anchored at Mumbai
convert_to_geotiff('../data/sar/train/Class_1/class_1_00025.jpg', 'mumbai_spill_demo.tif', 72.0, 19.0)

# Generate a Class_0 (Clean) demo file 
convert_to_geotiff('../data/sar/train/Class_0/class_0_00010.jpg', 'mumbai_clean_demo.tif', 72.0, 19.0)