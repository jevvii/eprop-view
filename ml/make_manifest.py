"""Build the committed artifact manifest from the export parity report.

The manifest is the authoritative checksum pin the server compares against the
bytes it is about to load.

Usage: python -I ml/make_manifest.py --report r.json --onnx m.onnx --config config.json \
         --ckpt ckpt_best.pth --out crack-ssdlite320-damsegment-v1.json \
         --command "..." --finished 2026-11-18T05:00:00Z [--version 1.0.0]
"""
import argparse
import hashlib
import json
import os


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", required=True)
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--config", required=True)
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--command", required=True)
    ap.add_argument("--finished", required=True)
    ap.add_argument("--version", default="1.0.0")
    args = ap.parse_args()

    report = json.load(open(args.report, encoding="utf-8"))
    config = json.load(open(args.config, encoding="utf-8"))
    if not report.get("parity_ok"):
        raise SystemExit("Refusing to write a manifest for an artifact that failed parity.")

    manifest = {
        "artifact": "crack-ssdlite320-damsegment-v1",
        "version": args.version,
        "architecture": config.get("architecture"),
        "sha256": sha256(args.onnx),
        "bytes": os.path.getsize(args.onnx),
        "input_size": config.get("input_size", 320),
        "labels": ["crack", "spalling"],
        "class_map": {"0": "background", "1": "crack", "2": "spalling"},
        "consumes": ["crack"],
        "dataset": "DamSegment v1 detection release",
        "dataset_doi": "10.17632/z5z6gtt5t4.1",
        "dataset_license": "CC BY 4.0",
        "dataset_credit": "Gharehbaghi, Bennett, Lequesne, Zhao, Li (University of Kansas)",
        "trained_on": "Fine-tuned from TorchVision COCO-pretrained SSDLite320-MobileNetV3-Large",
        "base_weights": config.get("pretrained"),
        "opset": report.get("opset"),
        "parity": {
            "torch_detections": report.get("torch_detections"),
            "onnx_detections": report.get("onnx_detections"),
            "max_box_delta": report.get("max_box_delta"),
            "max_score_delta": report.get("max_score_delta"),
            "labels_match": report.get("labels_match"),
            "onnxruntime_python": report.get("onnxruntime"),
        },
        "checkpoint_sha256": sha256(args.ckpt),
        "training": {
            "seed": config.get("seed"),
            "epochs": config.get("epochs"),
            "batch_size": config.get("batch_size"),
            "optimizer": config.get("optimizer"),
            "lr": config.get("lr"),
            "momentum": config.get("momentum"),
            "weight_decay": config.get("weight_decay"),
            "scheduler": config.get("scheduler"),
            "augmentations": config.get("augmentations"),
            "anchor_scales": config.get("anchor_scales"),
            "torch": config.get("torch"),
            "torchvision": config.get("torchvision"),
            "cuda_runtime": config.get("cuda_runtime"),
            "cudnn": config.get("cudnn"),
            "device": config.get("device"),
            "split_hashes": config.get("split_hashes"),
            "command": args.command,
            "finished_utc": args.finished,
        },
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    print(json.dumps({k: manifest[k] for k in ["artifact", "version", "sha256", "bytes", "input_size"]}, indent=2))


if __name__ == "__main__":
    main()
