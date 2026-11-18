# November 19 trained detector execution checklist

Complete in order unless the plan identifies an independent probe. Record the evidence path alongside each completed item.

- [x] Verify isolated local staging HEAD, GPU/optimizer step, effective Supabase and Vercel targets, and runtime/export compatibility.
  - HEAD `fa372f0` on `feat/preview-owned-crack-detector`; no upstream configured (local snapshot carried forward).
  - GPU probe `dataset/runs/probe/` — torch 2.5.1+cu121, GTX 1650 sm_75, cuDNN 90100, real step ΔW = 0.120, 0.21 GB peak (`ml/smoke_gpu.py`).
  - ONNX export parity: 300/300 detections, max box delta 9.2e-5, `parity_ok=true` (`dataset/runs/probe/probe.onnx`).
  - Node runtime: onnxruntime-node 1.31.1 loads; full JS path exercised by `src/app/lib/trained-detector.test.ts` (9/9 pass).
  - Effective Supabase `gbuwldihkmapzondxkto`; `npm run verify:preview` schema+role check passed. Vercel CLI identity `jevvii`; project not yet linked.
- [x] Freeze licensed DamSegment detection manifests and split hashes. Inspect overlays, negatives and cross-split duplicates.
  - Source: `10.17632/z5z6gtt5t4.1`, CC BY 4.0, "Damage Detection.zip" 104,772,985 bytes, sha256 `2423567183c584568efd45a2f4521c5d5f3f65106f2d2ff1311ed99b7adba1a9` (matches publisher).
  - Inventory: 1500 images, 19,229 crack / 481 spalling boxes, class 0 = crack (visually confirmed), 3 quarantined.
  - Split: `dataset/split.json`, seed 20261118, 1048/225/224, 0 cross-split leaks, min cross-split Hamming 12.
- [x] Run the real heuristic baseline. Record its version and scoring protocol. Lock the decision criteria before inspecting test outcomes.
  - Protocol + gates frozen in `verification/trained-detector-decision-rule.md` before test was opened.
  - Baseline runs through the production module (`runDetection`) in `ml/evaluate.ts`.
- [x] Execute initial supervised training. Save the command, actual run log, configuration, checkpoint and digest. Reload and reproduce predictions.
  - r1: 60 epochs, stock anchors, 961.8 s; best epoch 45 val F1 0.1777, photo recall 0.7834, 0/8 negative alerts. `dataset/runs/r1/` (config.json, log.jsonl, ckpt_best.pth).
  - Export parity: 300/300 detections, max matched box delta 1.2e-4, score delta 1.0e-6, `parity_ok=true` (`dataset/runs/r1/export_report.json`).
  - r2: crack-scale anchors (min_ratio 0.03), 60 epochs — see `dataset/runs/r2/`.
- [ ] Select on validation, freeze, and evaluate both methods on the held-out groups. Save counts, metrics and example misses.
- [x] Integrate the artifact under a Preview flag. Verify exported inference parity, mixed-method provenance, valid empty output, failure fallback, preserved reviews and atomic reruns.
  - Code landed: `onnx-detector.ts`, `flags.ts`, `ai.ts` trained path, migration `026`, UI method/fallback/attribution, `supabase/tests/trained_detector.sql` and `_preview.sql`.
  - SQL transaction test passed on a disposable PostgreSQL 18 instance: mixed provenance, reviewed-finding survival, IoU duplicate suppression, stale-box clearing, empty success, supersede, client privilege denial, no risk inflation.
- [ ] Test, typecheck, lint and build. Apply any guarded forward migration. Verify signed-in Preview behavior, hosted latency and rollback before enabling the successful candidate.
- [ ] Record the final flag state, Preview URL, checkpoint location, Git commit, manuscript sections and unresolved limitations. If a gate failed, record the retained working configuration.
