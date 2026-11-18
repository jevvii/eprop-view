"""Turn an evaluation JSON into report tables, per source prefix and failures.

Usage: python -I ml/report.py <eval.json> <threshold> [--split-name test]
"""
import json
import re
import sys
from collections import defaultdict


def iou(a, b):
    x1 = max(a["x"], b["x"]); y1 = max(a["y"], b["y"])
    x2 = min(a["x"] + a["width"], b["x"] + b["width"])
    y2 = min(a["y"] + a["height"], b["y"] + b["height"])
    iw = max(0.0, x2 - x1); ih = max(0.0, y2 - y1)
    inter = iw * ih
    union = a["width"] * a["height"] + b["width"] * b["height"] - inter
    return 0.0 if union <= 0 else inter / union


def match(preds, gts, thr=0.5):
    used = [False] * len(gts)
    tp = 0
    for p in sorted(preds, key=lambda x: -x["score"]):
        best, best_iou = -1, 0.0
        for i, g in enumerate(gts):
            if used[i]:
                continue
            v = iou(p["bbox"], g)
            if v > best_iou:
                best_iou, best = v, i
        if best >= 0 and best_iou >= thr:
            used[best] = True
            tp += 1
    return tp, len(preds) - tp, len(gts) - tp


def prefix_of(name):
    m = re.match(r"^([A-Za-z]+)", name)
    return m.group(1) if m else "?"


def ratio(a, b):
    return 0.0 if b == 0 else a / b


def main():
    path, threshold = sys.argv[1], float(sys.argv[2])
    data = json.load(open(path, encoding="utf-8"))
    rows = data["per_image"]

    def aggregate(subset, method):
        tp = fp = fn = 0
        photo_hits = photos = 0
        neg_photos = neg_alerts = neg_boxes = 0
        for r in subset:
            gts = r["gt_boxes"]
            if method == "heuristic":
                preds = [p for p in r["heuristic"]["boxes"] if p["score"] >= 0.25]
            else:
                preds = [p for p in r["trained"]["boxes"] if p["score"] >= threshold]
            t, f, n = match(preds, gts)
            tp += t; fp += f; fn += n
            if gts:
                photos += 1
                if preds:
                    photo_hits += 1
            else:
                neg_photos += 1
                if preds:
                    neg_alerts += 1
                neg_boxes += len(preds)
        precision = ratio(tp, tp + fp)
        recall = ratio(tp, tp + fn)
        f1 = ratio(2 * precision * recall, precision + recall)
        return {
            "photos": photos, "negatives": neg_photos, "tp": tp, "fp": fp, "fn": fn,
            "precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4),
            "photo_recall": round(ratio(photo_hits, photos), 4),
            "neg_alerts": neg_alerts,
            "neg_alerts_per_photo": round(ratio(neg_alerts, neg_photos), 3),
            "neg_boxes_per_photo": round(ratio(neg_boxes, neg_photos), 2),
        }

    by_prefix = defaultdict(list)
    for r in rows:
        by_prefix[prefix_of(r["name"])].append(r)

    out = {"threshold": threshold, "overall": {}, "by_prefix": {}}
    for method in ("heuristic", "trained"):
        out["overall"][method] = aggregate(rows, method)
        for p, subset in sorted(by_prefix.items()):
            out["by_prefix"].setdefault(p, {})[method] = aggregate(subset, method)

    # Failure examples: missed photos (no crack box) and negatives that fired.
    misses, false_alarms = [], []
    for r in rows:
        preds = [p for p in r["trained"]["boxes"] if p["score"] >= threshold]
        if r["gt_cracks"] > 0 and not preds:
            misses.append({"name": r["name"], "gt_cracks": r["gt_cracks"]})
        if r["gt_cracks"] == 0 and preds:
            false_alarms.append({"name": r["name"], "preds": len(preds),
                                 "top_score": max((p["score"] for p in preds), default=None)})
    out["failure_examples"] = {"missed_photos": misses[:12], "negative_false_alarms": false_alarms[:12]}

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
