"""Train a crack/spalling detector on DamSegment v1 (detection release).

Architecture: TorchVision SSDLite320-MobileNetV3-Large, COCO-pretrained, with
the classification head replaced by a 3-class head (background, crack, spalling).
Input: 320x320 (the architecture's native size). Box regression head retained.

Everything that determines the result is written to the run directory:
config.json, log.jsonl, ckpt_last.pth, ckpt_best.pth and epoch checkpoints.

Usage:
  python -I ml/train.py --split dataset/split.json --images <dir> --out dataset/runs/r1 \
      [--epochs 25] [--batch 8] [--lr 0.005] [--resume]
"""
import argparse
import json
import os
import random
import time

import numpy as np
import torch
import torchvision
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import tv_tensors
from torchvision.models.detection import (
    SSDLite320_MobileNet_V3_Large_Weights,
    ssdlite320_mobilenet_v3_large,
)
from torchvision.models.detection._utils import retrieve_out_channels
from torchvision.models.detection.ssd import SSDClassificationHead
from torchvision.models.detection.anchor_utils import DefaultBoxGenerator
from torchvision.transforms import v2

NUM_CLASSES = 3
LABEL_CRACK = 1
LABEL_SPALLING = 2
INPUT = 320


def build_model(num_classes=NUM_CLASSES, pretrained=True, min_ratio=0.2, max_ratio=0.95, input_size=INPUT):
    weights = SSDLite320_MobileNet_V3_Large_Weights.COCO_V1 if pretrained else None
    model = ssdlite320_mobilenet_v3_large(weights=weights)
    in_channels = retrieve_out_channels(model.backbone, (320, 320))
    num_anchors = model.anchor_generator.num_anchors_per_location()
    model.head.classification_head = SSDClassificationHead(in_channels, num_anchors, num_classes=num_classes)
    # Crack boxes are small (median 7.5% of the frame), while the stock SSD
    # default boxes start at 20% of the image. Keeping the aspect ratios and
    # lowering the minimum scale lets the regressor reach hairline defects.
    if (min_ratio, max_ratio) != (0.2, 0.95):
        model.anchor_generator = DefaultBoxGenerator(
            [[2, 3] for _ in range(6)], min_ratio=min_ratio, max_ratio=max_ratio
        )
    if input_size != 320:
        model.transform.min_size = (input_size,)
        model.transform.max_size = input_size
    return model


class DamDataset(Dataset):
    def __init__(self, images, image_dir, train, input_size=INPUT):
        self.images = images
        self.dir = image_dir
        self.train = train
        self.input_size = input_size
        self.augment = v2.Compose(
            [
                v2.RandomHorizontalFlip(p=0.5),
                v2.RandomApply(
                    [v2.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.02)], p=0.6
                ),
                v2.RandomApply([v2.GaussianBlur(kernel_size=3, sigma=(0.1, 1.2))], p=0.2),
            ]
        )

    def __len__(self):
        return len(self.images)

    def __getitem__(self, i):
        rec = self.images[i]
        img = Image.open(os.path.join(self.dir, rec["name"] + ".jpg")).convert("RGB")
        img = img.resize((self.input_size, self.input_size), Image.BILINEAR)
        w, h = img.size
        boxes = torch.tensor(
            [[b["x"] * w, b["y"] * h, (b["x"] + b["w"]) * w, (b["y"] + b["h"]) * h] for b in rec["boxes"]],
            dtype=torch.float32,
        )
        labels = torch.tensor(
            [LABEL_CRACK if b["cls"] == 0 else LABEL_SPALLING for b in rec["boxes"]], dtype=torch.int64
        )
        if self.train:
            # Typed bounding boxes let v2 flip geometry consistently with pixels.
            typed = tv_tensors.BoundingBoxes(boxes, format="XYXY", canvas_size=(h, w))
            img, typed, labels = self.augment(img, typed, labels)
            boxes = typed.as_subclass(torch.Tensor)
            keep = (boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1])
            boxes, labels = boxes[keep], labels[keep]
        target = {
            "boxes": boxes,
            "labels": labels,
            "image_id": torch.tensor([i]),
            "area": (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1]),
            "iscrowd": torch.zeros(len(boxes), dtype=torch.int64),
        }
        pixels = v2.functional.pil_to_tensor(img).float().div(255.0)
        return pixels, target


def collate(batch):
    return [b[0] for b in batch], [b[1] for b in batch]


@torch.no_grad()
def evaluate(model, loader, device, score_thresh=0.30, iou_thresh=0.5):
    """Greedy per-image matching for crack boxes; returns micro counts."""
    model.eval()
    tp = fp = fn = 0
    photos_hit = photos_total = 0
    neg_photos = neg_fp = 0
    for images, targets in loader:
        images = [im.to(device) for im in images]
        outputs = model(images)
        for out, tgt in zip(outputs, targets):
            pred_mask = (out["labels"] == LABEL_CRACK) & (out["scores"] >= score_thresh)
            pred = out["boxes"][pred_mask].cpu()
            gt_mask = tgt["labels"] == LABEL_CRACK
            gt = tgt["boxes"][gt_mask]
            n_gt = len(gt)
            photo_has = n_gt > 0
            if photo_has:
                photos_total += 1
            else:
                neg_photos += 1
            used = torch.zeros(len(gt), dtype=torch.bool)
            matched = 0
            for p in pred:
                if len(gt) == 0:
                    break
                ix1 = torch.maximum(p[0], gt[:, 0])
                iy1 = torch.maximum(p[1], gt[:, 1])
                ix2 = torch.minimum(p[2], gt[:, 2])
                iy2 = torch.minimum(p[3], gt[:, 3])
                inter = (ix2 - ix1).clamp(min=0) * (iy2 - iy1).clamp(min=0)
                area_p = (p[2] - p[0]) * (p[3] - p[1])
                area_g = (gt[:, 2] - gt[:, 0]) * (gt[:, 3] - gt[:, 1])
                iou = inter / (area_p + area_g - inter).clamp(min=1e-9)
                iou = torch.where(used, torch.zeros_like(iou), iou)
                best, idx = iou.max(dim=0)
                if best >= iou_thresh:
                    used[idx] = True
                    matched += 1
                    tp += 1
                else:
                    fp += 1
                    if not photo_has:
                        neg_fp += 1
            fn += int(n_gt) - matched
            if photo_has and matched > 0:
                photos_hit += 1
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "tp": tp, "fp": fp, "fn": fn,
        "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
        "photo_recall": round(photos_hit / photos_total, 4) if photos_total else 0.0,
        "photo_positive_count": photos_total,
        "negative_photos": neg_photos,
        "false_alerts_on_negatives": neg_fp,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=0.005)
    ap.add_argument("--momentum", type=float, default=0.9)
    ap.add_argument("--weight-decay", type=float, default=0.0005)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=20261118)
    ap.add_argument("--min-ratio", type=float, default=0.2)
    ap.add_argument("--max-ratio", type=float, default=0.95)
    ap.add_argument("--input", type=int, default=INPUT)
    ap.add_argument("--resume", action="store_true")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    split = json.load(open(args.split, encoding="utf-8"))
    train_recs = split["splits"]["train"]["images"]
    val_recs = split["splits"]["val"]["images"]

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

    device = torch.device("cuda")
    model = build_model(pretrained=True, min_ratio=args.min_ratio, max_ratio=args.max_ratio,
                        input_size=args.input).to(device)
    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.SGD(params, lr=args.lr, momentum=args.momentum, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=args.lr * 0.05)

    train_ds = DamDataset(train_recs, args.images, train=True, input_size=args.input)
    val_ds = DamDataset(val_recs, args.images, train=False, input_size=args.input)
    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=args.workers,
                              collate_fn=collate, pin_memory=True, drop_last=False,
                              persistent_workers=args.workers > 0)
    val_loader = DataLoader(val_ds, batch_size=args.batch, shuffle=False, num_workers=args.workers,
                            collate_fn=collate, pin_memory=True)

    config = {
        "architecture": "ssdlite320_mobilenet_v3_large",
        "pretrained": "torchvision COCO_V1 ssdlite320_mobilenet_v3_large_coco-a79551df.pth",
        "torch": str(torch.__version__), "torchvision": str(torchvision.__version__),
        "cuda_runtime": str(torch.version.cuda), "cudnn": torch.backends.cudnn.version(),
        "device": torch.cuda.get_device_name(0),
        "num_classes": NUM_CLASSES, "class_map": {"1": "crack", "2": "spalling"},
        "input_size": args.input,
        "anchor_scales": {"min_ratio": args.min_ratio, "max_ratio": args.max_ratio,
                          "aspect_ratios": [2, 3]},
        "epochs": args.epochs, "batch_size": args.batch,
        "optimizer": "SGD", "lr": args.lr, "momentum": args.momentum,
        "weight_decay": args.weight_decay, "scheduler": "cosine",
        "seed": args.seed, "train_images": len(train_recs), "val_images": len(val_recs),
        "augmentations": ["RandomHorizontalFlip(p=0.5)",
                          "ColorJitter(brightness=.3,contrast=.3,saturation=.2,hue=.02) p=0.6",
                          "GaussianBlur(k=3,sigma=.1-1.2) p=0.2"],
        "split_hashes": split["split_hashes"],
        "dataset_doi": split["source"],
    }
    if not args.resume or not os.path.exists(os.path.join(args.out, "ckpt_last.pth")):
        with open(os.path.join(args.out, "config.json"), "w", encoding="utf-8") as fh:
            json.dump(config, fh, indent=2)

    start_epoch = 0
    global_step = 0
    best_f1 = -1.0
    if args.resume and os.path.exists(os.path.join(args.out, "ckpt_last.pth")):
        ckpt = torch.load(os.path.join(args.out, "ckpt_last.pth"), map_location="cpu", weights_only=True)
        model.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        scheduler.load_state_dict(ckpt["scheduler"])
        start_epoch = ckpt["epoch"] + 1
        global_step = ckpt["global_step"]
        best_f1 = ckpt.get("best_f1", -1.0)
        torch.set_rng_state(ckpt["torch_rng"])
        print(f"resumed at epoch {start_epoch}, step {global_step}, best_f1={best_f1}", flush=True)

    log_path = os.path.join(args.out, "log.jsonl")
    t_start = time.time()
    for epoch in range(start_epoch, args.epochs):
        model.train()
        epoch_t0 = time.time()
        running = {"classification": 0.0, "bbox_regression": 0.0}
        steps = 0
        for images, targets in train_loader:
            images = [im.to(device, non_blocking=True) for im in images]
            targets = [{k: v.to(device) for k, v in t.items()} for t in targets]
            loss_dict = model(images, targets)
            loss = sum(v for v in loss_dict.values())
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(params, 10.0)
            optimizer.step()
            for k in running:
                running[k] += float(loss_dict[k])
            steps += 1
            global_step += 1
        scheduler.step()
        epoch_s = time.time() - epoch_t0
        train_metrics = {k: round(v / max(1, steps), 4) for k, v in running.items()}

        val_metrics = evaluate(model, val_loader, device)
        record = {
            "epoch": epoch + 1, "steps": steps, "global_step": global_step,
            "epoch_seconds": round(epoch_s, 1), "elapsed_seconds": round(time.time() - t_start, 1),
            "lr": round(optimizer.param_groups[0]["lr"], 6),
            "train_loss": train_metrics, "total_train_loss": round(sum(train_metrics.values()), 4),
            "val": val_metrics,
            "gpu_peak_gb": round(torch.cuda.max_memory_allocated() / 1e9, 3),
        }
        print(json.dumps(record), flush=True)
        with open(log_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")

        state = {
            "model": model.state_dict(), "optimizer": optimizer.state_dict(),
            "scheduler": scheduler.state_dict(), "epoch": epoch, "global_step": global_step,
            "best_f1": best_f1, "config": config, "torch_rng": torch.get_rng_state(),
        }
        torch.save(state, os.path.join(args.out, "ckpt_last.pth"))
        torch.save(state, os.path.join(args.out, f"ckpt_epoch{epoch + 1:02d}.pth"))
        if val_metrics["f1"] > best_f1:
            best_f1 = val_metrics["f1"]
            state["best_f1"] = best_f1
            torch.save(state, os.path.join(args.out, "ckpt_best.pth"))
            with open(os.path.join(args.out, "best.json"), "w", encoding="utf-8") as fh:
                json.dump({"epoch": epoch + 1, "val": val_metrics, "global_step": global_step}, fh, indent=2)

    print(json.dumps({"done": True, "best_val_f1": best_f1,
                      "elapsed_seconds": round(time.time() - t_start, 1)}), flush=True)


if __name__ == "__main__":
    main()
