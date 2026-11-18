# Preview trained crack detector — verification record (2026-11-19)

Status: **in progress** — this file is filled from measured evidence only.
Nothing below is inferred.

## What ran where

| Layer | Where | Evidence |
| --- | --- | --- |
| Training | Local GTX 1650, isolated venv | `dataset/runs/r1/` |
| Export + parity | Local CPU, onnxruntime 1.32 | `dataset/runs/r1/export_report.json` |
| JS inference path | Node 26 + onnxruntime-node 1.31.1 | `src/app/lib/trained-detector.test.ts` (9/9) |
| SQL transaction | Disposable PostgreSQL 18 | `supabase/tests/trained_detector_preview.sql` PASS |
| Unit/integration suite | Local | `npm test` — 254/254 |
| Typecheck / lint / build | Local | 0 TS errors, 0 lint errors (58 warnings, baseline), build OK |
| Hosted inference | Vercel Preview | TBD |
| Migration | Supabase Preview `gbuwldihkmapzondxkto` | TBD |

## Artifact

| Field | Value |
| --- | --- |
| ONNX | `src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.onnx` |
| SHA-256 | TBD |
| Bytes | TBD |
| Manifest pin | `src/app/lib/ai/models/crack-ssdlite320-damsegment-v1.json` |
| Checkpoint | `dataset/runs/r1/ckpt_best.pth` (sha256 TBD) |
| Export parity | TBD (torch vs onnxruntime box/score deltas) |

## Selection (validation only)

| Run | Configuration | Best val box F1 @0.50 | Chosen? |
| --- | --- | --- | --- |
| r1 | stock anchors (0.2–0.95), 320, 60 epochs | TBD | TBD |
| r2 | crack-scale anchors (0.03–0.95), 320 | TBD | TBD |

Chosen score threshold: TBD (rule in `trained-detector-decision-rule.md`).

## Held-out results

TBD — table copied from `dataset/runs/<run>/eval_test.json`.

## Hosted walkthrough

TBD — URL, commit, per-case observed method, result and latency.

## Flag state

TBD — deployments with the flag off and on, and which URL proves rollback.

## Blockers

None identified yet. Any blocked step is recorded with its evidence and the
concrete recovery action.
