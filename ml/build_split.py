"""Freeze seeded, duplicate-aware manifests for DamSegment v1 detection.

Rules (fixed before any model is trained):
  * class 0 = crack, class 1 = spalling (confirmed against the release imagery)
  * positive photo   = at least one crack box
  * crack-negative   = no crack box but at least one reviewed spalling box
  * quarantine       = no boxes at all, or any box that is degenerate/out of range
  * related views    = same prefix and dHash Hamming distance <= THRESHOLD, or
                       byte-identical fingerprints; a cluster never crosses splits
  * split by cluster, seeded; ratios 70/15/15

Usage: python -I ml/build_split.py <labels-dir> <hashes.json> <out.json> [--seed 20261118]
"""
import hashlib
import json
import os
import re
import sys
from collections import Counter

THRESHOLD = 6
SEED = "20261118"
RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def main():
    labels_dir, hashes_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    if "--seed" in sys.argv:
        seed = sys.argv[sys.argv.index("--seed") + 1]
    else:
        seed = SEED

    hashes = json.load(open(hashes_path, encoding="utf-8"))["images"]
    fp = {os.path.splitext(h["name"])[0]: int(h["dhash"], 16) for h in hashes}
    dims = {os.path.splitext(h["name"])[0]: (h["width"], h["height"]) for h in hashes}

    records = {}
    quarantined = []
    invalid_boxes = 0
    for name in sorted(os.listdir(labels_dir)):
        if not name.endswith(".txt"):
            continue
        stem = name[:-4]
        m = re.match(r"^([A-Za-z]+)\s*\((\d+)\)$", stem)
        if not m:
            quarantined.append({"name": stem, "reason": "unparseable filename"})
            continue
        prefix, idx = m.group(1), int(m.group(2))
        boxes, bad = [], False
        with open(os.path.join(labels_dir, name), encoding="utf-8", errors="replace") as fh:
            for line in fh:
                parts = line.split()
                if not parts:
                    continue
                if len(parts) != 5:
                    bad = True
                    continue
                cls = int(float(parts[0]))
                cx, cy, w, h = (float(p) for p in parts[1:])
                if w <= 0 or h <= 0 or w > 1.0001 or h > 1.0001:
                    bad = True
                    invalid_boxes += 1
                    continue
                # Clip centres to the frame; the annotation convention allows a
                # box to touch or slightly overrun an edge.
                x1 = max(0.0, cx - w / 2)
                y1 = max(0.0, cy - h / 2)
                x2 = min(1.0, cx + w / 2)
                y2 = min(1.0, cy + h / 2)
                if x2 - x1 <= 0 or y2 - y1 <= 0:
                    bad = True
                    invalid_boxes += 1
                    continue
                boxes.append(
                    {"cls": cls, "x": round(x1, 6), "y": round(y1, 6),
                     "w": round(x2 - x1, 6), "h": round(y2 - y1, 6)}
                )
        if bad:
            quarantined.append({"name": stem, "reason": "invalid box geometry"})
            continue
        if not boxes:
            quarantined.append({"name": stem, "reason": "no boxes (ambiguous / unlabelled)"})
            continue
        if stem not in fp:
            quarantined.append({"name": stem, "reason": "no fingerprint"})
            continue
        n_crack = sum(1 for b in boxes if b["cls"] == 0)
        n_spall = sum(1 for b in boxes if b["cls"] == 1)
        if n_crack > 0:
            kind = "positive"
        elif n_spall > 0:
            kind = "negative"
        else:
            quarantined.append({"name": stem, "reason": "unknown class id"})
            continue
        records[stem] = {
            "name": stem, "prefix": prefix, "index": idx, "kind": kind,
            "n_crack": n_crack, "n_spall": n_spall, "boxes": boxes,
            "width": dims[stem][0], "height": dims[stem][1],
        }

    names = sorted(records)
    # Union-find over related views.
    parent = {n: n for n in names}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    by_prefix = {}
    for n in names:
        by_prefix.setdefault(records[n]["prefix"], []).append(n)
    for prefix, group in by_prefix.items():
        for i in range(len(group)):
            for j in range(i + 1, len(group)):
                if hamming(fp[group[i]], fp[group[j]]) <= THRESHOLD:
                    union(group[i], group[j])
    # Identical fingerprints across prefixes are duplicates too.
    seen = {}
    for n in names:
        seen.setdefault(fp[n], []).append(n)
    for same in seen.values():
        for n in same[1:]:
            union(same[0], n)

    clusters = {}
    for n in names:
        clusters.setdefault(find(n), []).append(n)

    # Deterministic cluster order, independent of filesystem ordering.
    def order_key(members):
        h = hashlib.sha256((seed + "|" + "|".join(sorted(members))).encode()).hexdigest()
        return h

    cluster_list = sorted(clusters.values(), key=order_key)
    totals = {"positive": 0, "negative": 0}
    for n in names:
        totals[records[n]["kind"]] += 1

    targets = {s: {k: RATIOS[s] * totals[k] for k in totals} for s in RATIOS}
    current = {s: {"positive": 0, "negative": 0} for s in RATIOS}
    assigned_count = {s: 0 for s in RATIOS}
    assignment = {}
    for members in cluster_list:
        kinds = Counter(records[n]["kind"] for n in members)
        # Choose the split whose normalised deficit is largest for this cluster.
        best = max(
            RATIOS,
            key=lambda s: (
                sum((targets[s][k] - current[s][k]) for k in kinds) / max(1, RATIOS[s]),
                -assigned_count[s],
            ),
        )
        for n in members:
            assignment[n] = best
        assigned_count[best] += len(members)
        for k, c in kinds.items():
            current[best][k] += c

    # Repair: guarantee the predeclared minima for an interpretable test set.
    MIN_TEST_NEG, MIN_TEST_POS, MIN_TEST_CLUSTERS = 6, 150, 30

    def split_of_cluster(members):
        return assignment[members[0]]

    def counts(split):
        c = Counter(records[n]["kind"] for n, s in assignment.items() if s == split)
        return c

    def n_clusters(split):
        return sum(1 for m in cluster_list if split_of_cluster(m) == split)

    def move(members, dest):
        src = split_of_cluster(members)
        for n in members:
            assignment[n] = dest
        return src

    changed = True
    while changed:
        changed = False
        c = counts("test")
        if c["negative"] < MIN_TEST_NEG or c["positive"] < MIN_TEST_POS or n_clusters("test") < MIN_TEST_CLUSTERS:
            # Prefer a self-contained cluster from train that supplies what test lacks.
            for members in cluster_list:
                if split_of_cluster(members) != "train":
                    continue
                kinds = Counter(records[n]["kind"] for n in members)
                if c["negative"] < MIN_TEST_NEG and kinds["negative"] == 0:
                    continue
                if c["positive"] < MIN_TEST_POS and kinds["positive"] == 0:
                    continue
                if n_clusters("test") + 1 > n_clusters("train") - 1:
                    continue
                move(members, "test")
                changed = True
                break
    # Keep val non-empty for both classes where the data allows.
    for want in ("positive", "negative"):
        if counts("val")[want] == 0:
            for members in cluster_list:
                if split_of_cluster(members) != "train":
                    continue
                if any(records[n]["kind"] == want for n in members):
                    move(members, "val")
                    break

    split_names = {s: sorted(n for n, a in assignment.items() if a == s) for s in RATIOS}
    manifests = {}
    for s, members in split_names.items():
        manifests[s] = {
            "images": [records[n] for n in members],
            "images_count": len(members),
            "positives": sum(1 for n in members if records[n]["kind"] == "positive"),
            "negatives": sum(1 for n in members if records[n]["kind"] == "negative"),
            "crack_boxes": sum(records[n]["n_crack"] for n in members),
            "spalling_boxes": sum(records[n]["n_spall"] for n in members),
        }

    # Cross-split leakage check on the exact relation used for grouping.
    leaks = 0
    min_cross = 64
    for a in range(len(names)):
        for b in range(a + 1, len(names)):
            na, nb = names[a], names[b]
            if assignment[na] == assignment[nb]:
                continue
            d = hamming(fp[na], fp[nb])
            if d < min_cross:
                min_cross = d
            if d <= THRESHOLD:
                leaks += 1

    def digest(members):
        payload = json.dumps([records[n] for n in a_sorted(members)], sort_keys=True).encode()
        return hashlib.sha256(payload).hexdigest()

    def a_sorted(members):
        return sorted(members)

    out = {
        "source": "DamSegment v1 detection release, doi:10.17632/z5z6gtt5t4.1",
        "seed": seed,
        "group_rule": f"same prefix and dHash hamming <= {THRESHOLD}; identical fingerprints merged",
        "class_map": {"0": "crack", "1": "spalling"},
        "quarantined": quarantined,
        "invalid_box_count": invalid_boxes,
        "counts": {s: {k: v for k, v in manifests[s].items() if k != "images"} for s in RATIOS},
        "split_hashes": {s: digest(split_names[s]) for s in RATIOS},
        "cross_split_leaks": leaks,
        "min_cross_split_hamming": min_cross,
        "clusters": len(cluster_list),
        "cluster_sizes": sorted((len(c) for c in cluster_list), reverse=True)[:20],
        "splits": manifests,
    }
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
    print(json.dumps({k: out[k] for k in
                      ["counts", "split_hashes", "cross_split_leaks", "min_cross_split_hamming",
                       "clusters", "cluster_sizes", "quarantined"]}, indent=2))


if __name__ == "__main__":
    main()
