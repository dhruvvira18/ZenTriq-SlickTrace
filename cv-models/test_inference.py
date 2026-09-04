import os
import torch
import cv2 as cv
import numpy as np
import matplotlib.pyplot as plt
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

def test_model():
    device = torch.device("cpu")
    model = smp.Unet(
        encoder_name="resnet34",        
        encoder_weights=None,     
        in_channels=1,                  
        classes=1,                      
    )
    model.load_state_dict(torch.load("models/weights/unet_oil_spill.pth", map_location=device, weights_only=True))
    model.eval()

    # Mix of Oil (Class_1) and No-Oil (Class_0) images
    test_images = [
        "../data/sar/train/Class_1/class_1_00001.jpg",
        "../data/sar/train/Class_1/class_1_00010.jpg",
        "../data/sar/train/Class_0/class_0_00005.jpg",
        "../data/sar/train/Class_0/class_0_00015.jpg"
    ]

    for img_path in test_images:
        img = cv.imread(img_path, cv.IMREAD_GRAYSCALE)
        if img is None:
            continue
            
        img_resized = cv.resize(img, (256, 256))
        img_tensor = img_resized.astype(np.float32) / 255.0
        img_tensor = torch.tensor(img_tensor).unsqueeze(0).unsqueeze(0)

        with torch.no_grad():
            prediction = model(img_tensor)
            prob_mask = torch.sigmoid(prediction).squeeze().numpy()
            binary_mask = (prob_mask > 0.5).astype(np.uint8)
            
        # Apply the OpenCV post-processing filter here
        cleaned_mask = clean_spill_mask(binary_mask)

        fig, arr = plt.subplots(1, 3, figsize=(15, 5))
        arr[0].imshow(img_resized, cmap='gray')
        arr[0].set_title(f"Original: {os.path.basename(img_path)}")
        arr[0].axis('off')

        arr[1].imshow(binary_mask, cmap='gray')
        arr[1].set_title("Raw AI Output")
        arr[1].axis('off')
        
        arr[2].imshow(cleaned_mask, cmap='gray')
        arr[2].set_title("Cleaned GIS Polygon")
        arr[2].axis('off')

        plt.tight_layout()
        plt.show()

if __name__ == "__main__":
    test_model()