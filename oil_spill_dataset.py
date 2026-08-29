import cv2 as cv
import os
import numpy as np
import torch
from torch.utils.data import Dataset

class OilSpillData(Dataset):
    def __init__(self, image_dir, label_dir):
        self.image_dir = image_dir
        self.label_dir = label_dir

        extensions = ('.jpg', '.png', '.jpeg')
        self.images = [f for f in os.listdir(image_dir) if f.lower().endswith(extensions)]
        self.images.sort()

    def __len__(self):
        return len(self.images)
    def __getitem__(self, index):
        file_name = self.images[index]

        image_path = os.path.join(self.image_dir,file_name)
        label_filename = os.path.splitext(file_name)[0] + ".png"
        label_path = os.path.join(self.label_dir,label_filename)

        #reading SAR(synthetic aperture radar) Image
        image = cv.imread(image_path, cv.IMREAD_GRAYSCALE)
        if image is None:
            raise ValueError(
                f"Image cant be read: {image_path}"
            )
        image = cv.resize(image,(512,256),interpolation=cv.INTER_AREA) # approximate size so that it doesnt distort the image too much
        #using interpolation to maintain quality
        image = image.astype(np.float32) / 255.0 #normalizing 

        #reading Labelled image
        label = cv.imread(label_path, cv.IMREAD_COLOR)
        if label is None:
            raise ValueError(
                f"Image cant be label: {label_path}"
            )
        label = cv.cvtColor(label,cv.COLOR_BGR2RGB)
        label = cv.resize(label,(512,256), interpolation=cv.INTER_NEAREST)

        oil_mask = np.zeros((256,512),dtype=np.int64) #creating mask for each class
        black = np.all(label == [0,0,0],axis = -1) # evaluates every pixel in the image to check if it is black,for each individual pixel returns false if even one of the rgb values in the channel is non zero
