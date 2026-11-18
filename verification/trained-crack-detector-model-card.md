# Model card — DamSegment Crack Detector v1.0.0

Scope: Preview-only pilot for saved-photo crack localisation. Not a production
model and not field-validated. See `docs/capstone_v2_scope_contract.md`
(addendum dated 2026-11-18) for the authorising boundary.

## Identity

| Field | Value |
| --- | --- |
| Artifact | `crack-ssdlite320-damsegment-v1.onnx` |
| Manifest (checksum pin) | `src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.json` |
| Architecture | TorchVision `ssdlite320_mobilenet_v3_large`, COCO-pretrained backbone and box head |
| Head | 3-class classification head replaced: 0 background, 1 crack, 2 spalling |
| Input | 320×320 RGB, letterboxed, values in [0,1]; the graph normalises (mean/std 0.5) |
| Output | Boxes (frame coordinates), scores, labels; SSD post-process (score floor 0.01, NMS 0.55) |
| Served by | `onnxruntime-node` 1.31.1 on the Node.js runtime, CPU execution provider |
| Consumed classes | `crack` only. Spalling is trained as a separate class so a spalling region is not called a crack; the app's heuristic still supplies corrosion/spalling on saved photos |
| SHA-256 | `7a20253df77ae6f91eb7bbc3a2c15ea4850e6404e9af6cd7f3472a375c72db5b` |
| Bytes | `10,300,143` |

Reproduce with `ml/README.md`. Training code is in `ml/train.py`; export and
parity check in `ml/export_onnx.py`.

## Intended use

* Saved inspection photos in Preview, behind `TRAINED_CRACK_DETECTOR=on`.
* Proposing visible crack boxes for a human reviewer as **detection scores**.
* A zero-crack prediction is a valid outcome.

## Out of scope

* Field or engineering certification; no claim of structural adequacy.
* Local buildings or any site other than the source dam.
* Live AR, annotation draft generation, or any route other than saved photos.
* Online learning, reinforcement learning, or live weight updates.
* Any inference on a developer laptop as part of the hosted path.

## Training data

| Field | Value |
| --- | --- |
| Dataset | DamSegment v1, **detection** release |
| DOI | `10.17632/z5z6gtt5t4.1` |
| Licence | CC BY 4.0 |
| Credit | Gharehbaghi, Bennett, Lequesne, Zhao and Li, University of Kansas |
| Archive | `Damage Detection.zip`, 104,772,985 bytes |
| Archive SHA-256 | `2423567183c584568efd45a2f4521c5d5f3f65106f2d2ff1311ed99b7adba1a9` (matches the publisher) |
| Images | 1,500 × 640×640 JPEG from one concrete dam |
| Labels | 19,229 crack boxes, 481 spalling boxes |
| Class map | 0 = crack, 1 = spalling (confirmed against sample imagery) |
| Quarantined | 3 images with no boxes (ambiguous/unlabelled) |
| Split | 1,048 train / 225 validation / 224 test; seed `20261118` |
| Grouping | dHash (64-bit) Hamming ≤ 6 within a source prefix; identical fingerprints merged. 0 cross-split pairs; minimum observed cross-split Hamming distance 12 |
| Frozen manifests | `ml/splits/damsegment-v1-detection-split.json`, `ml/splits/damsegment-v1-image-hashes.json` |

Crack-positive photo: ≥1 crack box. Crack-negative photo: no crack box but ≥1
spalling box (54 in total; 8 in test). Augmentation was applied to the training
split only.

## Training procedure

| Field | Value |
| --- | --- |
| Hardware | NVIDIA GeForce GTX 1650, 3.9 GB, sm_75 |
| Software | torch 2.5.1+cu121, torchvision 0.20.1+cu121, CUDA 12.1, cuDNN 90100 |
| Base weights | `ssdlite320_mobilenet_v3_large_coco-a79551df.pth` (COCO_V1) |
| Optimizer | SGD, momentum 0.9, weight decay 5e-4 |
| LR schedule | Cosine annealing from 0.005 to 5% (0.00025) |
| Batch size | 8 |
| Epochs | 60 (best checkpoint at epoch 42) |
| Seed | 20261118 (Python, NumPy, PyTorch, CUDA) |
| Augmentation | horizontal flip 0.5; colour jitter 0.6; Gaussian blur 0.2 |
| Anchors | `min_ratio` 0.03, `max_ratio` 0.95, aspect ratios [2, 3] (crack-tuned; stock 0.2–0.95 performed worse) |
| Run log / config | `dataset/runs/r2/log.jsonl`, `config.json` |
| Checkpoint | `dataset/runs/r2/ckpt_best.pth`, sha256 `6013d47e0e6eeb3bee18cb80582705d7330c887c91a894476a9b083e29101596` |
| Wall clock | 972.4 s (60 epochs, ~13–16 s/epoch) |

Final training losses and the exact command are in the run log and manifest.

## Evaluation

Final training losses (epoch 60): classification 1.6495, box regression 0.7627,
total 2.4122.

Validation at the selected 0.45 threshold: box precision 0.521, recall 0.140,
F1 0.221; photo-level recall 0.912; 0 of 8 reviewed negatives alerted.

Held-out test (read once, after the rule was frozen):

| Method | TP | FP | FN | Precision | Recall | Box F1 @0.50 | Photo recall | False-alert photos / negative |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Heuristic | 29 | 3,358 | 2,678 | 0.0086 | 0.0107 | 0.0095 | 0.801 | 0.875 |
| This model @0.45 | 342 | 354 | 2,365 | 0.491 | 0.126 | 0.201 | 0.847 | 0.5 |

Source E is the weak slice (photo recall 0.648 vs the heuristic's 0.831); the
overall gate still passes. See `preview-trained-detector-2026-11-19.md`.

## Limitations

* **One dam.** Results are a within-source pilot, not evidence about local
  buildings or other concrete types.
* **Few negatives.** Only 8 crack-negative photos in test; the false-alarm gate
  has low power. Raw counts are reported, not only the average.
* **Small objects.** Median crack box is 7.5% of frame width; 320-pixel input
  and SSD anchors limit hairline recall.
* **Boxes, not masks.** The release is box-labelled; no pixel-level crack width
  is produced.
* **Threshold.** The score threshold was chosen on validation; it is not a
  calibrated probability.
* **No field validation, no adviser approval.**

## Integrity and attribution

* TorchVision code and weights: BSD-3-Clause (PyTorch Vision).
* Dataset: CC BY 4.0; attribution retained in the manifest and UI copy.
* Reviewer feedback is stored but **not** used to retrain automatically.
* The model is refused on production deployments by the flag guard.
