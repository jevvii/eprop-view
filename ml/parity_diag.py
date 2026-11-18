"""Diagnose torch-vs-ONNX box differences for the exported detector."""
import json
import sys

import numpy as np
import torch
from torchvision.models.detection import ssdlite320_mobilenet_v3_large
from torchvision.models.detection._utils import retrieve_out_channels
from torchvision.models.detection.ssd import SSDClassificationHead
from torchvision.models.detection.anchor_utils import DefaultBoxGenerator

NUM_CLASSES = 3


def build(ckpt, pretrained=False, min_ratio=0.2, max_ratio=0.95, input_size=320):
    weights = None
    model = ssdlite320_mobilenet_v3_large(weights=weights, weights_backbone=None)
    in_ch = retrieve_out_channels(model.backbone, (320, 320))
    num_anchors = model.anchor_generator.num_anchors_per_location()
    model.head.classification_head = SSDClassificationHead(in_ch, num_anchors, num_classes=NUM_CLASSES)
    if (min_ratio, max_ratio) != (0.2, 0.95):
        model.anchor_generator = DefaultBoxGenerator([[2, 3] for _ in range(6)], min_ratio=min_ratio, max_ratio=max_ratio)
    if input_size != 320:
        model.transform.min_size = (input_size,)
        model.transform.max_size = input_size
    if ckpt:
        model.load_state_dict(ckpt["model"])
    return model.eval()


def main():
    ckpt_path, onnx_path = sys.argv[1], sys.argv[2]
    torch.serialization.add_safe_globals([torch.torch_version.TorchVersion])
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=True)
    cfg = ckpt.get("config", {})
    anchors = cfg.get("anchor_scales", {})
    input_size = int(cfg.get("input_size", 320))
    model = build(ckpt, min_ratio=float(anchors.get("min_ratio", 0.2)),
                  max_ratio=float(anchors.get("max_ratio", 0.95)), input_size=input_size)

    g = torch.Generator().manual_seed(11)
    tensor = torch.rand(1, 3, input_size, input_size, generator=g)
    with torch.no_grad():
        out = model([tensor[0]])[0]
    tb = out["boxes"].numpy(); ts = out["scores"].numpy(); tl = out["labels"].numpy()

    import onnxruntime as ort
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    ob, os_, ol = sess.run(None, {"images": tensor.numpy()})

    order_t = np.lexsort((tl, -ts, tb[:, 1], tb[:, 0]))
    print(json.dumps({
        "torch_n": len(tb), "onnx_n": len(ob),
        "unique_scores_torch": len(np.unique(np.round(ts, 6))),
        "unique_scores_onnx": len(np.unique(np.round(os_, 6))),
        "score_equal_sorted": bool(np.allclose(np.sort(ts), np.sort(os_), atol=1e-5)),
        "first_scores_torch": [round(float(x), 5) for x in ts[:8]],
        "first_scores_onnx": [round(float(x), 5) for x in os_[:8]],
    }, indent=2))

    # Greedy match ONNX boxes to torch boxes at equal score and label.
    matched = 0
    deltas = []
    for i in range(len(tb)):
        same = np.where((np.abs(os_ - ts[i]) < 1e-5) & (ol == tl[i]))[0]
        if len(same) == 0:
            continue
        d = np.abs(ob[same] - tb[i]).max(axis=1)
        deltas.append(float(d.min()))
        if d.min() < 0.5:
            matched += 1
    deltas = np.array(deltas)
    print(json.dumps({
        "score_label_matched": int(len(deltas)),
        "boxes_within_0.5px": int(matched),
        "max_matched_delta": float(deltas.max()) if len(deltas) else None,
        "p99_matched_delta": float(np.percentile(deltas, 99)) if len(deltas) else None,
        "unmatched": int(len(tb) - len(deltas)),
    }, indent=2))


if __name__ == "__main__":
    main()
