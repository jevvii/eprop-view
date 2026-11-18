"""Draw ground truth and predictions side by side for representative cases.

Green outline = released annotation (ground truth crack box).
Red box      = trained detector output above the chosen score threshold.
Blue box     = heuristic output.

Usage: python -I ml/overlays.py <eval.json> <images-dir> <out-dir> <threshold>
"""
import json
import os
import sys

from PIL import Image, ImageDraw

GREEN = (22, 163, 74)
RED = (220, 38, 38)
BLUE = (37, 99, 235)


def draw(path, out_path, gt, preds, heur, threshold, title):
    img = Image.open(path).convert("RGB")
    scale = 2 if img.width < 800 else 1
    if scale != 1:
        img = img.resize((img.width * scale, img.height * scale), Image.BILINEAR)
    d = ImageDraw.Draw(img)
    w, h = img.size

    def rect(b, colour, width):
        d.rectangle(
            [b["x"] * w, b["y"] * h, (b["x"] + b["width"]) * w, (b["y"] + b["height"]) * h],
            outline=colour, width=width,
        )

    for b in gt:
        rect(b, GREEN, 3)
    for p in heur:
        rect(p["bbox"], BLUE, 1)
    kept = [p for p in preds if p["score"] >= threshold]
    for p in kept:
        rect(p["bbox"], RED, 2)
    d.rectangle([0, 0, w, 22], fill=(0, 0, 0))
    d.text((6, 5), f"{title} | gt {len(gt)} | pred {len(kept)} @ {threshold}", fill=(255, 255, 255))
    img.save(out_path)


def main():
    eval_path, images_dir, out_dir, threshold = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
    data = json.load(open(eval_path, encoding="utf-8"))
    os.makedirs(out_dir, exist_ok=True)

    positives = [r for r in data["per_image"] if r["kind"] == "positive"]
    negatives = [r for r in data["per_image"] if r["kind"] == "negative"]

    def fn_count(r):
        t = r["trained"]["perThreshold"]
        return t[next(iter(t))]["fn"]

    explicit = []
    if "--names" in sys.argv:
        wanted = set(sys.argv[sys.argv.index("--names") + 1].split(","))
        explicit = [r for r in data["per_image"] if r["name"] in wanted]

    chosen = list(explicit)
    if not explicit:
        chosen += sorted(positives, key=lambda r: (-r["gt_cracks"], r["name"]))[:2]
        chosen += sorted(positives, key=lambda r: (-fn_count(r), r["name"]))[:3]
        chosen += negatives[:3]

    seen = set()
    manifest = []
    for rec in chosen:
        if rec["name"] in seen:
            continue
        seen.add(rec["name"])
        title = f"{rec['name']} | {rec['kind']}"
        out = os.path.join(out_dir, f"{rec['name'].replace(' ', '_')}.png")
        draw(
            os.path.join(images_dir, rec["name"] + ".jpg"),
            out,
            rec.get("gt_boxes", []),
            rec["trained"]["boxes"],
            rec["heuristic"].get("boxes", []),
            threshold,
            title,
        )
        manifest.append(out)
    print(json.dumps({"overlays": manifest, "threshold": threshold}, indent=1))


if __name__ == "__main__":
    main()
