import cv2
import os
import glob
import numpy as np

def generate_unet_masks():
    input_dir = "../data/sar/train/Class_1"
    mask_dir = "../data/sar/train/Masks"
    os.makedirs(mask_dir, exist_ok=True)
    
    image_paths = glob.glob(os.path.join(input_dir, "*.jpg"))
    print(f"[*] Found {len(image_paths)} oil images. Generating masks...")
    
    for img_path in image_paths:
        # Read as grayscale
        img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
        if img is None: continue
        
        # Apply Gaussian blur to remove radar speckle noise
        blurred = cv2.GaussianBlur(img, (5, 5), 0)
        
        # Otsu's thresholding: automatically finds the optimal threshold for dark oil
        _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # Save the mask
        filename = os.path.basename(img_path)
        cv2.imwrite(os.path.join(mask_dir, filename), mask)
        
    print(f"[SUCCESS] Masks generated in {mask_dir}")

if __name__ == "__main__":
    generate_unet_masks()