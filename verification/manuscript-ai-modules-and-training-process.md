# Manuscript sections — AI Modules and Training Process

Draft for the capstone manuscript. Every number below is measured on the frozen
DamSegment v1 detection split unless marked otherwise. Values still to be
inserted from the final evaluation are marked `TBD`.

## AI Modules

ePropView separates three kinds of machine assistance and never conflates them.

**Deterministic heuristic (non-ML).** A rules-based worker divides a normalized
image into an 8×8 grid and flags cells by edge-gradient energy, red/blue
channel divergence and dark-ridge density. It proposes crack-, corrosion- and
spalling-like regions. It is not a trained model, and the interface labels it
"Heuristic (non-ML)". It remains the fallback for saved photos, the source of
annotation drafts, and the only method used when the trained detector is
disabled or fails.

**Project-trained crack detector (this pilot).** A TorchVision
SSDLite320-MobileNetV3 detector, fine-tuned on the public DamSegment v1 box
release, proposes visible crack boxes for saved photographs. It runs in-process
on the Node.js runtime through ONNX Runtime, with the exported graph containing
the resize/normalization transform and the SSD post-process. The served artifact
is pinned by a SHA-256 manifest; a checksum, load, shape or timeout failure
falls back to the complete heuristic. Trained outputs are presented as a
**detection score**, never as calibrated probability. Corrosion and spalling on
saved photos still come from the heuristic, so a single run can legitimately
carry two provenances: `model` for crack and `heuristic` for the other classes.

**Deliberate hosted analysis (Gemini).** A user-triggered request sends one
saved photo to Gemini for a narrative second opinion, with its existing
rate-limit-aware fallback. It is separate from the default local action and is
never invoked implicitly.

**Provenance and transactions.** Every analysis job records the method that
actually ran (`model`, `heuristic` or `gemini`), the artifact digest, the number
of crack and other findings, and any fallback reason. One database transaction
commits findings, inspection risk and job completion together. A new local run
supersedes unreviewed local findings from either local method, so switching
methods cannot leave stale boxes; reviewed and rejected findings are never
deleted, and a re-proposed crack box overlapping a reviewed one (IoU ≥ 0.5) is
suppressed. Maintenance tickets are unique per verified detection, so retries do
not duplicate them. A successful empty result is recorded as a completed job with
zero findings.

The trained path is gated by a Preview-only flag that defaults off and is refused
when `VERCEL_ENV=production`. With the flag off, the previous heuristic route is
unchanged.

## Training Process

**Data.** The DamSegment v1 detection release (DOI `10.17632/z5z6gtt5t4.1`,
CC BY 4.0) contains 1,500 640×640 photographs from a single concrete dam, with
19,229 crack and 481 spalling bounding boxes (class 0 = crack, class 1 =
spalling). The archive's SHA-256 matches the publisher's record. Three
unlabelled images were quarantined. Related views and duplicates were grouped by
64-bit dHash within each source prefix (Hamming ≤ 6, identical fingerprints
merged) and split by group into 1,048 / 225 / 224 images for train / validation
/ test, seed `20261118`; no pair closer than the grouping threshold crosses a
split (minimum observed cross-split Hamming distance 12). A crack-positive photo
has at least one crack box; a crack-negative photo has spalling boxes but no
crack box. Augmentation was confined to training.

**Model and optimisation.** SSDLite320-MobileNetV3-Large was initialised from
TorchVision's documented COCO-pretrained weights; the classification head was
replaced with a three-class head and the box-regression head retained. Input was
320×320 with horizontal flip, colour jitter and mild blur. Optimisation used SGD
(momentum 0.9, weight decay 5×10⁻⁴, cosine schedule, batch 8, seed 20261118) on
a 4 GB GTX 1650; `TBD` epochs took `TBD`. Checkpoints were written every epoch
and the best validation box F1 was retained.

**Selection and evaluation.** The score threshold and checkpoint were chosen on
validation only, against gates fixed before the test split was opened: photo-level
crack recall at least equal to the heuristic, strictly higher box F1 at IoU 0.50,
and at most one false crack alert per reviewed negative photo. Both methods were
then run on identical held-out images through their production code paths.

| Method | Photo recall | Box precision | Box recall | Box F1 @ IoU 0.50 | False alerts / negative photo |
| --- | --- | --- | --- | --- | --- |
| Heuristic (validation) | 0.729 | 0.010 | 0.011 | 0.011 | 0.875 |
| Trained (validation, TBD) | TBD | TBD | TBD | TBD | TBD |
| Heuristic (test) | TBD | TBD | TBD | TBD | TBD |
| Trained (test, TBD) | TBD | TBD | TBD | TBD | TBD |

**Errors and limits.** TBD — representative misses and false alarms are attached
as overlays. The pilot covers one dam and eight crack-negative test photos, so
it supports a within-source claim only. It is not evidence of accuracy on local
buildings, and it carries no engineering certification.
