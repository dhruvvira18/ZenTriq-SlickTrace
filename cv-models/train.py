import os
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, ConcatDataset
from torch.optim import AdamW
import segmentation_models_pytorch as smp
import albumentations as A
from albumentations.pytorch import ToTensorV2
from dataset import OilSpillDataset

def get_training_augmentation():
    # Artificially multiplies data by applying random flips, rotations, and contrast shifts
    return A.Compose([
        A.Resize(256, 256),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.RandomRotate90(p=0.5),
        A.RandomBrightnessContrast(p=0.2),
        ToTensorV2(),
    ])

def main():
    # 1. Device Configuration
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[*] Training on device: {device}")

    mask_dir = "../data/sar/train/Masks"

    # 2. Dataset and Loader
    # Load Class 1 (Oil)
    dataset_class1 = OilSpillDataset(
        image_dir="../data/sar/train/Class_1", 
        mask_dir=mask_dir, 
        transform=get_training_augmentation()
    )
    
    # Load Class 0 (No Oil)
    dataset_class0 = OilSpillDataset(
        image_dir="../data/sar/train/Class_0", 
        mask_dir=mask_dir, 
        transform=get_training_augmentation()
    )
    
    # Merge the two datasets mathematically
    combined_dataset = ConcatDataset([dataset_class1, dataset_class0])
    
    train_loader = DataLoader(combined_dataset, batch_size=16, shuffle=True, num_workers=0)

    # 3. Model Architecture (U-Net with a pre-trained ResNet34 backbone)
    model = smp.Unet(
        encoder_name="resnet34",        
        encoder_weights="imagenet",     
        in_channels=1,                  # SAR is grayscale (1 channel)
        classes=1,                      # Binary output (Oil vs. Background)
    ).to(device)

    # 4. Loss Function and Optimizer
    # BCEWithLogitsLoss is mathematically optimized for binary segmentation
    criterion = nn.BCEWithLogitsLoss()
    optimizer = AdamW(model.parameters(), lr=0.001)

    # 5. The Training Loop
    epochs = 10
    print("[*] Beginning Training Loop...")
    
    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        
        for batch_idx, (images, masks) in enumerate(train_loader):
            images = images.to(device)
            masks = masks.to(device)

            # Forward pass
            predictions = model(images)
            loss = criterion(predictions, masks)

            # Backward pass and optimize
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            running_loss += loss.item()
            
        avg_loss = running_loss / len(train_loader)
        print(f"Epoch [{epoch+1}/{epochs}] - Loss: {avg_loss:.4f}")

    # 6. Save the trained weights
    os.makedirs("models/weights", exist_ok=True)
    torch.save(model.state_dict(), "models/weights/unet_oil_spill.pth")
    print("[SUCCESS] Model saved to models/weights/unet_oil_spill.pth")

if __name__ == "__main__":
    main()