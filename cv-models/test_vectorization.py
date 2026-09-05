import torch
import cv2 as cv
import numpy as np
import rasterio
import rasterio.features
from shapely.geometry import shape, mapping
import json
import segmentation_models_pytorch as smp

def clean_spill_mask(binary_mask, min_area_pixels=150):
    kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, (3, 3))
    cleaned = cv.morphologyEx(binary_mask, cv.MORPH_OPEN, kernel)
    contours, _ = cv.findContours(cleaned, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    
    filtered_mask = np.zeros_like(cleaned)
    for cnt in contours:
        if cv.contourArea(cnt) >= min_area_pixels:
            cv.drawContours(filtered_mask, [cnt], -1, 1, thickness=cv.FILLED)
    return filtered_mask

def test_vectorization():
    device = torch.device("cpu")
    model = smp.Unet(encoder_name="resnet34", encoder_weights=None, in_channels=1, classes=1)
    model.load_state_dict(torch.load("models/weights/unet_oil_spill.pth", map_location=device, weights_only=True))
    model.eval()

    # Load a known positive oil image
    img_path = "../data/sar/train/Class_1/class_1_00001.jpg"
    img = cv.imread(img_path, cv.IMREAD_GRAYSCALE)
    img_resized = cv.resize(img, (256, 256))
    img_tensor = torch.tensor(img_resized.astype(np.float32) / 255.0).unsqueeze(0).unsqueeze(0)

    # 1. AI Inference
    with torch.no_grad():
        prediction = model(img_tensor)
        prob_mask = torch.sigmoid(prediction).squeeze().numpy()
        binary_mask = (prob_mask > 0.5).astype(np.uint8)
        
    cleaned_mask = clean_spill_mask(binary_mask)

    # 2. Vectorization (The Bridge to Backend)
    # Define a dummy affine transform mapping the top-left pixel to Mumbai offshore (72.0E, 19.0N)
    # Each pixel represents roughly 10 meters (0.0001 degrees)
    dummy_transform = rasterio.transform.from_origin(west=72.0, north=19.0, xsize=0.0001, ysize=0.0001)

    features = []
    # Extract polygonal shapes from the binary mask array
    for geom, val in rasterio.features.shapes(cleaned_mask, transform=dummy_transform):
        if val == 1.0: # Only extract the Oil polygons, ignore the background
            features.append({
                "type": "Feature",
                "properties": {"anomaly_type": "oil_spill"},
                "geometry": mapping(shape(geom))
            })

    # Assemble final GeoJSON
    geojson_output = {
        "type": "FeatureCollection",
        "features": features
    }

    print("\n[+] AI Inference Complete.")
    print(f"[+] Found {len(features)} distinct oil polygon(s).")
    print("\n--- GENERATED GEOJSON OUTPUT ---")
    print(json.dumps(geojson_output, indent=2))

if __name__ == "__main__":
    test_vectorization()