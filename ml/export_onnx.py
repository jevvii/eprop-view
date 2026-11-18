"""Export the fine-tuned SSDLite320 detector to ONNX and verify parity.

The exported graph contains the torchvision transform (resize/normalize) and the
SSD post-process (score threshold + NMS), so the JavaScript side only has to
letterbox to 320x320 and divide by 255.

Usage:
  python -I ml/export_onnx.py --checkpoint <ckpt.pth> --out <model.onnx>
  python -I ml/export_onnx.py --out <model.onnx>          # random head, mechanics only
"""
import argparse
import json

import numpy as np
import torch
import torchvision
from torchvision.models.detection import (
    SSDLite320_MobileNet_V3_Large_Weights,
    ssdlite320_mobilenet_v3_large,
)
from torchvision.models.detection._utils import retrieve_out_channels
from torchvision.models.detection.ssd import SSDClassificationHead
from torchvision.models.detection.anchor_utils import DefaultBoxGenerator

NUM_CLASSES = 3  # 0 background, 1 crack, 2 spalling


def build_model(num_classes=NUM_CLASSES, pretrained=True, min_ratio=0.2, max_ratio=0.95, input_size=320):
    weights = SSDLite320_MobileNet_V3_Large_Weights.COCO_V1 if pretrained else None
    # The training build loads COCO weights, which forces weights_backbone=None
    # and therefore the reduced MobileNetV3 tail. Passing None explicitly is
    # required to reproduce that shape when loading a checkpoint, because the
    # constructor otherwise defaults to ImageNet backbone weights (full tail).
    model = ssdlite320_mobilenet_v3_large(weights=weights, weights_backbone=None)
    in_channels = retrieve_out_channels(model.backbone, (320, 320))
    num_anchors = model.anchor_generator.num_anchors_per_location()
    model.head.classification_head = SSDClassificationHead(in_channels, num_anchors, num_classes=num_classes)
    if (min_ratio, max_ratio) != (0.2, 0.95):
        model.anchor_generator = DefaultBoxGenerator(
            [[2, 3] for _ in range(6)], min_ratio=min_ratio, max_ratio=max_ratio
        )
    if input_size != 320:
        model.transform.min_size = (input_size,)
        model.transform.max_size = input_size
    return model


class ExportWrapper(torch.nn.Module):
    """Flatten the detector's list-of-dicts output into three tensors."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, images):
        out = self.model(images)
        boxes = torch.cat([o["boxes"] for o in out], dim=0)
        scores = torch.cat([o["scores"] for o in out], dim=0)
        labels = torch.cat([o["labels"] for o in out], dim=0).to(torch.int64)
        return boxes, scores, labels


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint")
    ap.add_argument("--out", required=True)
    ap.add_argument("--image", help="real image to use for parity")
    ap.add_argument("--report", help="write the parity report JSON here")
    ap.add_argument("--opset", type=int, default=17)
    args = ap.parse_args()

    model = build_model(pretrained=args.checkpoint is None)
    ckpt = None
    if args.checkpoint:
        # Checkpoints are written by ml/train.py. Only torch's own version
        # string type needs allowlisting beyond tensors and plain primitives.
        torch.serialization.add_safe_globals([torch.torch_version.TorchVersion])
        # Checkpoints are written by ml/train.py and hold only tensors and plain
        # primitives, so weights_only keeps the loader from unpickling code.
        ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
        cfg = ckpt.get("config", {}) or {}
        anchors = cfg.get("anchor_scales", {}) or {}
        input_size = int(cfg.get("input_size", 320))
        model = build_model(
            pretrained=False,
            min_ratio=float(anchors.get("min_ratio", 0.2)),
            max_ratio=float(anchors.get("max_ratio", 0.95)),
            input_size=input_size,
        )
        model.load_state_dict(ckpt["model"])
        print("loaded checkpoint epoch", ckpt.get("epoch"), "step", ckpt.get("global_step"),
              "input", input_size, "anchors", anchors)
    model.eval()
    input_size = int((ckpt or {}).get("config", {}).get("input_size", 320)) if ckpt else 320

    if args.image:
        from PIL import Image
        img = Image.open(args.image).convert("RGB").resize((input_size, input_size))
        arr = np.asarray(img, dtype=np.float32) / 255.0
        tensor = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
    else:
        g = torch.Generator().manual_seed(11)
        tensor = torch.rand(1, 3, input_size, input_size, generator=g)

    wrapper = ExportWrapper(model).eval()
    with torch.no_grad():
        torch_boxes, torch_scores, torch_labels = wrapper(tensor)

    dynamic = {"images": {0: "batch"}, "boxes": {0: "num"}, "scores": {0: "num"}, "labels": {0: "num"}}
    torch.onnx.export(
        wrapper,
        (tensor,),
        args.out,
        input_names=["images"],
        output_names=["boxes", "scores", "labels"],
        opset_version=args.opset,
        dynamic_axes=dynamic,
        do_constant_folding=True,
        dynamo=False,
    )

    import onnx
    import onnxruntime as ort

    onnx_model = onnx.load(args.out)
    onnx.checker.check_model(onnx_model)
    sess = ort.InferenceSession(args.out, providers=["CPUExecutionProvider"])
    ort_boxes, ort_scores, ort_labels = sess.run(None, {"images": tensor.numpy()})

    n = min(len(torch_boxes), len(ort_boxes))
    # Detections are not emitted in a guaranteed identical order (many boxes
    # share near-identical low scores), so match each PyTorch box to the ONNX
    # box with the same score and label and measure the coordinate delta.
    tb = torch_boxes.numpy(); ts = torch_scores.numpy(); tl = torch_labels.numpy()
    deltas = []
    unmatched = 0
    for i in range(len(tb)):
        same = np.where((np.abs(ort_scores - ts[i]) < 1e-5) & (ort_labels == tl[i]))[0]
        if len(same) == 0:
            unmatched += 1
            continue
        deltas.append(float(np.abs(ort_boxes[same] - tb[i]).max(axis=1).min()))
    deltas = np.array(deltas) if deltas else np.array([0.0])
    box_delta = float(deltas.max())
    score_delta = float(np.abs(np.sort(ts) - np.sort(ort_scores)).max()) if n else 0.0
    same_labels = bool(unmatched == 0) and bool(len(torch_boxes) == len(ort_boxes))

    import os
    report = {
        "onnx_path": args.out,
        "onnx_bytes": os.path.getsize(args.out),
        "opset": args.opset,
        "torch_detections": int(len(torch_boxes)),
        "onnx_detections": int(len(ort_boxes)),
        "max_box_delta": box_delta,
        "max_score_delta": score_delta,
        "labels_match": same_labels,
        "unmatched_detections": unmatched,
        "input_name": sess.get_inputs()[0].name,
        "outputs": [(o.name, o.shape) for o in sess.get_outputs()],
        "torch": torch.__version__,
        "torchvision": torchvision.__version__,
        "onnxruntime": ort.__version__,
        "parity_ok": bool(n > 0 and box_delta < 1e-3 and score_delta < 1e-3 and same_labels),
    }
    print(json.dumps(report, indent=2))
    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2)


if __name__ == "__main__":
    main()
