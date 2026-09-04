import os
import cv2 as cv
import numpy as np
import torch
from torch.utils.data import Dataset

class OilSpillDataset(Dataset):
    def __init__(self, image_dir, mask_dir, transform=None):
        self.image_dir = image_dir
        self.mask_dir = mask_dir
        self.transform = transform
        
        valid_ext = ('.jpg', '.png', '.jpeg', '.tif')
        self.images = sorted([f for f in os.listdir(image_dir) if f.lower().endswith(valid_ext)])

    def __len__(self):
        return len(self.images)

    def __getitem__(self, index):
        file_name = self.images[index]
        image_path = os.path.join(self.image_dir, file_name)
        mask_path = os.path.join(self.mask_dir, file_name)

        image = cv.imread(image_path, cv.IMREAD_GRAYSCALE)
        
        # If a mask exists (Class_1), load and binarize it. 
        # If not (Class_0), create a purely black array of zeros.
        if os.path.exists(mask_path):
            mask = cv.imread(mask_path, cv.IMREAD_GRAYSCALE)
            mask = (mask > 127).astype(np.float32)
        else:
            mask = np.zeros_like(image, dtype=np.float32)

        image = image.astype(np.float32) / 255.0

        if self.transform:
            augmented = self.transform(image=image, mask=mask)
            image = augmented['image']
            mask = augmented['mask']
        else:
            image = torch.tensor(image, dtype=torch.float32).unsqueeze(0)
            mask = torch.tensor(mask, dtype=torch.float32).unsqueeze(0)

        return image, mask