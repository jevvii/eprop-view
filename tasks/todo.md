# November 19 trained detector execution checklist

Complete in order unless the plan identifies an independent probe. Record the evidence path alongside each completed item.

- [x] Verify isolated local staging HEAD, GPU/optimizer step, effective Supabase and Vercel targets, and runtime/export compatibility.
  - HEAD `fa372f0` → carried forward; GPU probe `ml/smoke_gpu.py` (ΔW 0.120, 0.21 GB); export parity; Node/JS path 9/9; Supabase `gbuwldihkmapzondxkto`; Vercel `jevvii` / `eprop-view` Preview.
- [x] Freeze licensed DamSegment detection manifests and split hashes. Inspect overlays, negatives and cross-split duplicates.
  - `dataset/split.json`, seed `20261118`, 1048/225/224, 0 leaks, min cross-split Hamming 12, 3 quarantined; publisher SHA-256 matched.
- [x] Run the real heuristic baseline. Record its version and scoring protocol. Lock the decision criteria before inspecting test outcomes.
  - Rule frozen in `verification/trained-detector-decision-rule.md`; heuristic val: photo recall 0.756, F1 0.011, 0.875 false alerts/negative photo.
- [x] Execute initial supervised training. Save the command, actual run log, configuration, checkpoint and digest. Reload and reproduce predictions.
  - r1 (stock anchors): val F1 0.1777. r2 (crack-scale anchors): val F1 0.2819, chosen.
  - Checkpoint sha256 `6013d47e…`; artifact sha256 `7a20253d…`; export parity 300/300, box delta 2.4e-4.
- [x] Select on validation, freeze, and evaluate both methods on the held-out groups. Save counts, metrics and example misses.
  - Threshold 0.45 chosen on validation. Test: photo recall 0.847 vs 0.801; box F1 0.201 vs 0.0095; 0.5 vs 0.875 false alerts/negative. Source E is weaker (0.648 vs 0.831) and disclosed.
- [x] Integrate the artifact under a Preview flag. Verify exported inference parity, mixed-method provenance, valid empty output, failure fallback, preserved reviews and atomic reruns.
  - Code + migration 026; SQL transaction test PASS on PostgreSQL 18 and on Preview (rolled back); per-finding provenance; empty success; fallback reason recorded.
- [x] Test, typecheck, lint and build. Apply any guarded forward migration. Verify signed-in Preview behavior, hosted latency and rollback before enabling the successful candidate.
  - 254/254 tests, typecheck, lint (0 errors), build OK. Migration 026 applied and `verify:preview` passes.
  - Deployment A (flag off): https://eprop-view-8p7gghbyb-jevviis-projects.vercel.app — method recorded as heuristic.
  - Deployment B (flag on): https://eprop-view-54h2pwnfr-jevviis-projects.vercel.app — walkthrough in progress.
- [x] Record the final flag state, Preview URL, checkpoint location, Git commit, manuscript sections and unresolved limitations. If a gate failed, record the retained working configuration.
  - Final flag state: `TRAINED_CRACK_DETECTOR=on` for Preview only; refused on production.
  - Final deployment: https://eprop-view-fmf5e1660-jevviis-projects.vercel.app (commit `589f922`); rollback deployment A: https://eprop-view-8p7gghbyb-jevviis-projects.vercel.app (flag off, heuristic).
  - Hosted walkthrough: positive → model/3 boxes; negative → model/2 boxes (documented false positive); Gemini → gemini; verify+rerun → verified persisted; forced checksum failure → heuristic with exact reason; recovery → model. Cold 2.86 s, warm 111–147 ms.
  - Docs: `verification/trained-crack-detector-model-card.md`, `trained-detector-decision-rule.md`, `manuscript-ai-modules-and-training-process.md`, `preview-trained-detector-2026-11-19.md`.
  - Limitation disclosed: source E photo recall 0.648 vs heuristic 0.831; walkthrough uploads remain in the Preview vault.
