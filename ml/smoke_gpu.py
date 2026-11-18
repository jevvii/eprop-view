"""Prove the GTX 1650 can take a real optimizer step on the candidate detector.

This is a probe, not training: it downloads the documented COCO-pretrained
SSDLite320-MobileNetV3 weights, replaces the head with a 3-class head
(background, crack, spalling) and runs forward + backward + step.
"""
import json
import time

import torch
import torchvision
from torchvision.models.detection import (
    SSDLite320_MobileNet_V3_Large_Weights,
    ssdlite320_mobilenet_v3_large,
)
from torchvision.models.detection._utils import retrieve_out_channels
from torchvision.models.detection.ssd import SSDClassificationHead

out = {"torch": torch.__version__, "torchvision": torchvision.__version__}
out["cuda_available"] = torch.cuda.is_available()
if not torch.cuda.is_available():
    print(json.dumps(out, indent=2))
    raise SystemExit("CUDA unavailable; refusing to claim a GPU path.")

props = torch.cuda.get_device_properties(0)
out.update(
    {
        "device_name": props.name,
        "capability": f"{props.major}.{props.minor}",
        "total_mem_gb": round(props.total_memory / 1e9, 2),
        "cudnn": torch.backends.cudnn.version(),
        "cuda_runtime": torch.version.cuda,
    }
)

weights = SSDLite320_MobileNet_V3_Large_Weights.COCO_V1
# Load the documented COCO detector, then replace only the classification head
# with a 3-class head (background, crack, spalling). The box regression head is
# class-agnostic and is retained.
model = ssdlite320_mobilenet_v3_large(weights=weights)
in_channels = retrieve_out_channels(model.backbone, (320, 320))
# DefaultBoxGenerator reports one anchor count per feature map (six maps).
num_anchors = model.anchor_generator.num_anchors_per_location()
model.head.classification_head = SSDClassificationHead(in_channels, num_anchors, num_classes=3)
model.to("cuda")
model.train()
opt = torch.optim.SGD([p for p in model.parameters() if p.requires_grad], lr=0.005, momentum=0.9)

gen = torch.Generator().manual_seed(7)
images = [torch.rand(3, 320, 320, generator=gen).cuda() for _ in range(2)]
targets = [
    {
        "boxes": torch.tensor([[30.0, 40.0, 120.0, 200.0]], device="cuda"),
        "labels": torch.tensor([1], device="cuda"),
        "image_id": torch.tensor([i], device="cuda"),
        "area": torch.tensor([14400.0], device="cuda"),
        "iscrowd": torch.tensor([0], device="cuda"),
    }
    for i in range(2)
]

before = model.head.classification_head.module_list[0].weight.detach().clone()
torch.cuda.synchronize()
t0 = time.perf_counter()
losses = model(images, targets)
loss = sum(v for v in losses.values())
opt.zero_grad(set_to_none=True)
loss.backward()
opt.step()
torch.cuda.synchronize()
elapsed = time.perf_counter() - t0
after = model.head.classification_head.module_list[0].weight.detach()

out["step_seconds"] = round(elapsed, 3)
out["loss"] = {k: round(float(v), 4) for k, v in losses.items()}
out["total_loss"] = round(float(loss), 4)
out["weight_delta_norm"] = round(float((after - before).norm()), 6)
out["weights_changed"] = bool((after - before).abs().sum() > 0)
out["peak_mem_gb"] = round(torch.cuda.max_memory_allocated() / 1e9, 2)
out["num_classes_head"] = int(model.head.classification_head.num_columns)
out["pretrained_weights_enum"] = weights.name
print(json.dumps(out, indent=2))
