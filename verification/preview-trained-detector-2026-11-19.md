# Preview trained crack detector — verification record (2026-11-19)

Every number here is measured. Where a hosted step is still pending it is marked
**pending** rather than assumed.

## What ran where

| Layer | Where | Evidence |
| --- | --- | --- |
| Training (r1, r2) | Local GTX 1650, isolated Python 3.11 venv | `dataset/runs/r1/`, `dataset/runs/r2/` |
| Export + PyTorch parity | Local CPU, onnxruntime 1.32 | `dataset/runs/r2/export_report.json` |
| JS inference path | Node 26 + onnxruntime-web 1.31.1 (WASM) | `src/app/lib/trained-detector.test.ts` — 9/9 |
| Runtime equivalence (native vs WASM) | Local | zero box delta, zero unmatched, 3 seeds |
| SQL transaction | Disposable PostgreSQL 18 **and** Preview (rolled back) | `supabase/tests/trained_detector_preview.sql` — PASS |
| Unit/integration suite | Local | `npm test` — 254/254 |
| Typecheck / lint / build | Local | 0 TS errors; 0 lint errors (58 warnings, baseline); build OK |
| Migration 026 | Supabase Preview `gbuwldihkmapzondxkto` | `Applied 026_preview_trained_crack_detector.sql`; `verify:preview` passes |
| Hosted inference | Vercel Preview `eprop-view` | deployments A and B below |

## Artifact

| Field | Value |
| --- | --- |
| ONNX | `src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.onnx` |
| SHA-256 | `7a20253df77ae6f91eb7bbc3a2c15ea4850e6404e9af6cd7f3472a375c72db5b` |
| Bytes | 10,300,143 |
| Manifest pin | `src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.json` |
| Checkpoint | `dataset/runs/r2/ckpt_best.pth` |
| Checkpoint SHA-256 | `6013d47e0e6eeb3bee18cb80582705d7330c887c91a894476a9b083e29101596` |
| Export parity | 300/300 detections, max matched box delta 2.4e-4, score delta 1.6e-6, 0 unmatched |
| Serving runtime | onnxruntime-web 1.31.1, WASM, 1 thread (native and WASM outputs are bit-identical on the same graph) |

## Selection (validation only)

| Run | Configuration | Best val box F1 @0.50 | Chosen |
| --- | --- | --- | --- |
| r1 | stock anchors (0.2–0.95), 320, 60 epochs, 961.8 s | 0.1777 (ep 45) | no |
| r2 | crack-scale anchors (0.03–0.95), 320, 60 epochs, 972.4 s | **0.2819** (ep 42) | **yes** |

Operating point chosen by the frozen rule: **0.45** (see
`trained-detector-decision-rule.md`). Validation at 0.45: box precision 0.521,
recall 0.140, F1 0.221; photo recall 0.912; 0 of 8 reviewed negatives alerted.

## Held-out test results (read once, after the rule was frozen)

| Method | TP | FP | FN | Precision | Recall | Box F1 @0.50 | Photo recall | False-alert photos / negative |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Heuristic | 29 | 3,358 | 2,678 | 0.0086 | 0.0107 | 0.0095 | 0.8009 | 0.875 (7/8) |
| Trained @0.45 | 342 | 354 | 2,365 | 0.4914 | 0.1263 | **0.2010** | **0.8472** | **0.5 (4/8)** |

All three predeclared gates pass: photo recall ≥ heuristic, box F1 strictly
higher, and fewer than one false crack alert per reviewed negative photo.

The trained detector also emits 1.12 boxes per negative photo versus the
heuristic's 19.75.

### By source prefix (test, 0.45)

| Prefix | Heuristic photo recall | Heuristic F1 | Trained photo recall | Trained F1 | Trained TP/FP/FN | Negative photos alerted |
| --- | --- | --- | --- | --- | --- | --- |
| E | 0.831 | 0.0034 | 0.648 | 0.304 | 43 / 46 / 151 | 4 |
| H | 0.773 | 0.0120 | 0.985 | 0.149 | 174 / 221 / 1,766 | 0 |
| M | 0.798 | 0.0122 | 0.911 | 0.319 | 125 / 87 / 448 | 0 |

**Disclosed weakness:** on source E the trained detector misses more photos than
the heuristic (0.648 vs 0.831), even though the overall gate passes. The
validation-selected 0.45 threshold is conservative there; the alternative 0.30
point recorded on validation reaches E photo recall 0.859 and overall F1 0.269
with the same 0.5 false-alert rate on test. It was not selected because the
predeclared rule puts false alerts first.

### Representative errors

* `H (499)` — 93 annotated cracks, zero predictions at 0.45 (dense, faint crack
  map). Overlay: `dataset/runs/r2/overlays-explicit/H_(499).png`.
* `E (113)` — reviewed crack-negative (a spall cavity and rust staining), two
  crack boxes at 0.74 / 0.69. Overlay: `E_(113).png`.
* `E (352)` — reviewed negative, three boxes, top score 0.941 (high-confidence
  false positive).
* Missed positives in the test set include `E (100)`, `E (114)`, `E (137)`,
  `E (175)`, `E (194)`, `E (214)`.

Local CPU latency (WASM, 320×320, single image): mean 28 ms, p50 24 ms, p95
33 ms, first-call max 561 ms.

## Hosted Preview

Commit under test: `589f922` (the server behaviour below is identical to
`4a812c9`; `589f922` only makes the panel follow the completed job).

| Deployment | Flag | URL | Observed |
| --- | --- | --- | --- |
| A | absent (off) | https://eprop-view-8p7gghbyb-jevviis-projects.vercel.app | Method **heuristic**; "Trained detector flag is off." |
| B | `on` | https://eprop-view-1cgxjpoyr-jevviis-projects.vercel.app | All walkthrough cases below |
| B final | `on` | https://eprop-view-fmf5e1660-jevviis-projects.vercel.app | Positive re-verified; badge/caption correct |

Deployment A is a real, tested deployment of the same source and proves the flag
restores the previous route.

### Signed-in walkthrough (admin, hosted Preview)

| Case | Observed method | Result |
| --- | --- | --- |
| Known positive, `E (143)` | `model` | 3 crack boxes, scores 0.752 / 0.519 / 0.495; overlay matches the crack |
| Reviewed negative, `E (113)` | `model` | 2 crack boxes — a documented false positive, consistent with the offline run |
| Explicit Gemini analysis | `gemini` | Completed; provenance `gemini`; no fallback |
| Verify a finding, then rerun | `model` | Verified count 1 before and after rerun; no duplicate boxes |
| Forced artifact failure (registry checksum corrupted in Preview) | `heuristic` | Reason recorded: "Registry checksum deadbeefdead… disagrees with the bundled artifact manifest 7a20253d77a…." |
| Recovery after restoring the pin | `model` | 3 crack boxes again |

Hosted inference latency from the job records: **cold 2.86 s** (first call in a
fresh function, including WASM init), **warm 111–147 ms**; heuristic 124–284 ms.
The panel showed the badge "Trained detector (ONNX)", `320×320`, and the caption
naming "DamSegment Crack Detector v1.0.0" (`dataset/walkthrough/final-positive/`).

### Server-only checks

The SQL transaction test ran against the Preview database inside a transaction
and was rolled back; no walkthrough rows were committed by it.

### Hosting constraints encountered

* Vercel's 250 MB uncompressed function limit and the Hobby plan's 12-function
  cap. The native ONNX Runtime is auto-external in Next and is copied wholesale
  (294 MB). Serving with ONNX Runtime Web (WASM) keeps the `/document` function
  at 152.76 MB and the function count unchanged.
* WASM and native outputs are bit-identical on the same graph (verified), so the
  evaluated predictions are the served predictions.

## Flag state at the time of writing

`TRAINED_CRACK_DETECTOR=on` is set for the Preview environment only; the code
refuses it when `VERCEL_ENV=production`. Deployment A (flag off) remains live.

## Final flag state

`TRAINED_CRACK_DETECTOR=on` for the Preview environment only. The code refuses
it when `VERCEL_ENV=production`. Deployment A (flag off) remains live and proves
rollback. The candidate is enabled because every predeclared gate passed.

## Remaining limitations

* Source E is weaker than the heuristic on photo recall (0.648 vs 0.831) at the
  selected threshold; this is disclosed, not hidden.
* Eight crack-negative test photos give the false-alarm gate low power.
* One dam, box labels only, no field validation, no adviser approval.
* The preview deployment uses the Vercel Hobby plan; the WASM runtime was chosen
  to fit the 250 MB function limit rather than for speed.
