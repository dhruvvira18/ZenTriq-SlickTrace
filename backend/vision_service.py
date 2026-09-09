import os
import torch
import cv2 as cv
import numpy as np
import rasterio.transform
import rasterio.features
from rasterio.io import MemoryFile
from rasterio.transform import Affine, from_origin
from shapely.geometry import shape, mapping
import segmentation_models_pytorch as smp

# Pre-load the AI model into memory upon server startup
DEVICE = torch.device("cpu")
MODEL = smp.Unet(encoder_name="resnet34", encoder_weights=None, in_channels=1, classes=1)

# Resolves the path by looking exactly one folder up from backend/
WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), "..", "cv-models", "models", "weights", "unet_oil_spill.pth")
MODEL.load_state_dict(torch.load(WEIGHTS_PATH, map_location=DEVICE, weights_only=True))
MODEL.eval()

def clean_spill_mask(binary_mask, min_area_pixels=150):
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (3, 3))
    cleaned = cv.morphologyEx(binary_mask, cv.MORPH_OPEN, kernel)
    contours, _ = cv.findContours(cleaned, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    
    filtered_mask = np.zeros_like(cleaned)
    for cnt in contours:
        if cv.contourArea(cnt) >= min_area_pixels:
            cv.drawContours(filtered_mask, [cnt], -1, 1, thickness=cv.FILLED)
    return filtered_mask

def detect_oil_spill(image_bytes: bytes):
    img = None
    active_transform = None

    # 1. Attempt to read native GeoTIFF spatial metadata and raster data
    try:
        with MemoryFile(image_bytes) as memfile:
            with memfile.open() as src:
                raw_band = src.read(1)
                
                # Normalize non-uint8 rasters (e.g., 16-bit SAR) to standard 8-bit range
                if raw_band.dtype != np.uint8:
                    img = cv.normalize(raw_band, None, 0, 255, cv.NORM_MINMAX).astype(np.uint8)
                else:
                    img = raw_band

                # If the GeoTIFF contains valid georeferencing, adjust transform for 256x256 resizing
                if src.transform and src.transform != Affine.identity():
                    orig_h, orig_w = src.height, src.width
                    scale_x = orig_w / 256.0
                    scale_y = orig_h / 256.0
                    active_transform = src.transform * Affine.scale(scale_x, scale_y)
    except Exception:
        img = None
        active_transform = None

    # 2. Fallback loader for standard images (JPEG, PNG)
    if img is None:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv.imdecode(nparr, cv.IMREAD_GRAYSCALE)

    # 3. Fallback transform anchored at Mumbai offshore if metadata is missing
    if active_transform is None:
        active_transform = from_origin(west=72.0, north=19.0, xsize=0.0001, ysize=0.0001)

    # 4. Resize and prepare input tensor for U-Net
    img_resized = cv.resize(img, (256, 256))
    img_tensor = torch.tensor(img_resized.astype(np.float32) / 255.0).unsqueeze(0).unsqueeze(0)
    
    # 5. Model Inference & Morphological Cleaning
    with torch.no_grad():
        prediction = MODEL(img_tensor)
        prob_mask = torch.sigmoid(prediction).squeeze().numpy()
        binary_mask = (prob_mask > 0.5).astype(np.uint8)
        
    cleaned_mask = clean_spill_mask(binary_mask)

    # 6. Vectorize the resulting pixels into GPS coordinates using the dynamic transform
    features = []
    for geom, val in rasterio.features.shapes(cleaned_mask, transform=active_transform):
        if val == 1.0:
            features.append({
                "type": "Feature",
                "properties": {"anomaly_type": "oil_spill"},
                "geometry": mapping(shape(geom))
            })

    return {
        "is_oil_spill": len(features) > 0,
        "type": "FeatureCollection",
        "features": features
    }