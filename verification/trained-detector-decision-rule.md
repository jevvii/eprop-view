# Trained crack detector — predeclared pilot decision rule

Recorded **2026-11-18, before the test split was opened**. The test manifests in
`dataset/split.json` were frozen first (`seed 20261118`); their hashes are in
`dataset/split.json.split_hashes`. The heuristic is fixed and was not tuned. The
trained detector's score threshold and checkpoint are selected on **validation
only**.

## Populations

| Population | Definition |
| --- | --- |
| Crack-positive photo | At least one `class 0` (crack) box in the release annotation. |
| Crack-negative photo | No crack box, but at least one `class 1` (spalling) box. These are the reviewed negatives. |
| Quarantined | No boxes, unparseable name, or invalid geometry. Excluded from all splits. |

Both splits must contain both photo classes, and the test split must contain at
least **6 crack-negative photos** and **150 crack-positive photos** drawn from
at least **30 distinct duplicate groups**. These minima were met when the split
was frozen (test: 216 positive, 8 negative, 224 groups).

## Decision rule (all three must hold on the held-out test split)

1. **Photo-level crack recall** — among crack-positive photos, the fraction on
   which the method emits at least one crack box (an alert). Candidate **≥**
   heuristic.
2. **Box F1 at IoU 0.50** — micro-averaged over all crack boxes, one-to-one
   greedy matching, score-ordered. Candidate **>** heuristic.
3. **False crack alerts on reviewed negatives** — mean number of distinct
   negative *photos* receiving at least one crack box. Candidate **≤ 1.0** per
   photo, averaged over the negative photos.

Box precision, recall, TP/FP/FN, box-level false alarms per negative photo, and
per-source counts are reported alongside. A missed photo is one where the
method emitted no crack box; a false alarm is a negative photo that received
one.

## Interpretation limits, fixed in advance

* One dam. DamSegment v1 is a single-source collection. Passing is a
  **within-dam pilot** result and is not evidence about local buildings.
* 8 negative photos in test. The false-alarm gate has low statistical power;
  the count and the raw number are reported rather than only the average.
* The heuristic is an 8×8 grid over the whole frame, so its boxes are coarse by
  construction. A higher box F1 is expected; the meaningful question is whether
  the trained detector also retains photo-level recall without raising false
  alarms.
* No augmentation or threshold is tuned against the test split. If the test
  split influences any choice, that is disclosed and a fresh holdout is needed.

## Operating point selection (validation only)

The score threshold is chosen on validation by, in order: (a) satisfying
photo-level recall ≥ the heuristic's validation photo recall, (b) minimising
false alerts per negative photo, (c) maximising box F1. The exact chosen value
is appended below before the test split is read.

## Chosen operating point (recorded before opening the test split)

Selected on validation only, in the order fixed above.

* Candidate checkpoint: run `r2`, epoch 42 (crack-scale anchors, min_ratio 0.03).
* Validation: photo recall 0.839 at the training-time threshold; the full curve
  was then computed over identical validation images.
* Rule application: every threshold from 0.20 to 0.60 satisfies (a) photo
  recall ≥ the heuristic's 0.756. False alerts reach their minimum (0 of 8) at
  **0.45**; among thresholds ≥ 0.45, box F1 is highest at 0.45.
* **Chosen threshold: 0.45** (registry `confidence_threshold`).
* Validation at 0.45: box precision 0.521, recall 0.140, F1 0.221; photo recall
  0.912; 0 false alerts / 8 negatives. Heuristic: F1 0.011, photo recall 0.756,
  0.875 false alerts / negative photo.
* Disclosed trade-off: at 0.30 the candidate reaches F1 0.276 and photo recall
  0.968 but alerts 1 of 8 negatives (0.125/photo). The predeclared order puts
  false alerts first, so 0.45 is primary; 0.30 is reported as an alternative.

The test split has not been read at the time of this entry.
