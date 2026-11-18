"""Inventory the DamSegment v1 detection release without trusting its files.

Reads only label text and image metadata. Run with -I so nothing in the data
directory can be imported.

Usage: python -I ml/analyze_dataset.py <dataset-root> [--json out.json]
"""
import json
import os
import re
import statistics
import sys


def parse_yolo(path):
    rows = []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            parts = line.split()
            if len(parts) != 5:
                continue
            try:
                cls = int(float(parts[0]))
                cx, cy, w, h = (float(p) for p in parts[1:])
            except ValueError:
                continue
            rows.append({"cls": cls, "cx": cx, "cy": cy, "w": w, "h": h})
    return rows


def main():
    root = sys.argv[1]
    labels_dir = os.path.join(root, "Labels", "Yolo")
    images_dir = os.path.join(root, "Images")
    names = sorted(os.listdir(labels_dir))
    stats = {
        "images": 0,
        "by_prefix": {},
        "class_instances": {},
        "class_image_counts": {},
        "empty_label_images": [],
        "per_class_geometry": {},
        "prefix_class_matrix": {},
        "parse_errors": [],
    }
    geom = {0: [], 1: []}
    for name in names:
        if not name.endswith(".txt"):
            continue
        stats["images"] += 1
        m = re.match(r"^([A-Za-z]+)\s*\((\d+)\)", name)
        prefix = m.group(1) if m else "?"
        idx = int(m.group(2)) if m else -1
        rows = parse_yolo(os.path.join(labels_dir, name))
        label_bytes = os.path.getsize(os.path.join(labels_dir, name))
        if label_bytes == 0:
            stats["empty_label_images"].append(name)
        if len(rows) != label_bytes and label_bytes > 0:
            # every well-formed line has 5 fields; flag anything unparsed
            expected_lines = len([l for l in open(os.path.join(labels_dir, name), encoding="utf-8", errors="replace") if l.strip()])
            if expected_lines != len(rows):
                stats["parse_errors"].append({"file": name, "lines": expected_lines, "parsed": len(rows)})
        classes_present = sorted({r["cls"] for r in rows})
        stats["by_prefix"].setdefault(prefix, {"images": 0, "instances": {}})
        stats["by_prefix"][prefix]["images"] += 1
        for r in rows:
            stats["class_instances"][str(r["cls"])] = stats["class_instances"].get(str(r["cls"]), 0) + 1
            stats["by_prefix"][prefix]["instances"][str(r["cls"])] = (
                stats["by_prefix"][prefix]["instances"].get(str(r["cls"]), 0) + 1
            )
            geom.setdefault(r["cls"], []).append((r["w"], r["h"], r["w"] * r["h"]))
        key = ",".join(str(c) for c in classes_present) or "none"
        stats["class_image_counts"][key] = stats["class_image_counts"].get(key, 0) + 1
        pk = f"{prefix}|{key}"
        stats["prefix_class_matrix"][pk] = stats["prefix_class_matrix"].get(pk, 0) + 1

    for cls, rows in geom.items():
        if not rows:
            continue
        ws = [r[0] for r in rows]
        hs = [r[1] for r in rows]
        areas = [r[2] for r in rows]
        aspect = [max(r[0], r[1]) / max(1e-6, min(r[0], r[1])) for r in rows]
        stats["per_class_geometry"][str(cls)] = {
            "n": len(rows),
            "median_w": round(statistics.median(ws), 4),
            "median_h": round(statistics.median(hs), 4),
            "median_area_frac": round(statistics.median(areas), 5),
            "mean_area_frac": round(sum(areas) / len(areas), 5),
            "median_aspect": round(statistics.median(aspect), 3),
            "tiny_area_lt_0.001": sum(1 for a in areas if a < 0.001),
            "huge_area_gt_0.5": sum(1 for a in areas if a > 0.5),
        }

    # Image dimensions from the first frame of each prefix only (decoding is slow).
    try:
        from PIL import Image

        dims = {}
        for name in sorted(os.listdir(images_dir))[:400]:
            with Image.open(os.path.join(images_dir, name)) as im:
                dims[f"{im.width}x{im.height}"] = dims.get(f"{im.width}x{im.height}", 0) + 1
        stats["image_dims_sample"] = dims
    except Exception as exc:  # noqa: BLE001
        stats["image_dims_sample"] = {"error": str(exc)}

    text = json.dumps(stats, indent=2, sort_keys=True)
    if "--json" in sys.argv:
        with open(sys.argv[sys.argv.index("--json") + 1], "w", encoding="utf-8") as fh:
            fh.write(text)
    print(text)


if __name__ == "__main__":
    main()
