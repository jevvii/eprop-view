# Claude handoff — EPROPVIEW Preview reliability remediation

## Assignment

Work in the prepared staging-only checkout on branch `feat/preview-owned-crack-detector`. The reviewed tip is `76fcc2e`; preserve later work and check which findings still apply. Read `AGENTS.md`, the relevant installed Next.js guides and `tasks/plan.md`. The review reproduced all 224 test-image scores and found that the deployed candidate exceeded the false-box limit. Deliver the reliability fixes, their tests and a dated evidence report. Retain the original measurements, trained artifact and checkpoint so the team can reproduce the capstone result.

Use only the local training sandbox, Supabase Preview `gbuwldihkmapzondxkto` and Vercel project `eprop-view` on Preview. Check the effective project and target before any hosted operation. Work through the existing guarded commands and Preview-scoped credentials. Protect existing inspections, findings and review decisions. Keep production, shared branch history and unrelated worktrees outside this assignment. If remote scope cannot be verified, complete the local fixes and report the hosted step separately.

## Execution order and acceptance tests

### 1. Contain the failed release decision and secure the walkthrough

Record the current Preview deployment, flag, artifact digest and fallback route. Restore the heuristic as the shared Preview default using the verified Preview-only configuration and deploy if required for the change to take effect. Verify the effective method on the active Preview. Report any older immutable deployment where the flag remains on. Use a separate disposable Preview deployment for trained-path checks.

In `ml/walkthrough.mjs`, validate the exact HTTPS deployment origin against trusted Vercel project and environment metadata before loading credentials or browser state. Restrict the authenticated browser flow to approved application and required Preview service origins; check the final login origin before filling credentials. Require an explicit disposable fixture inspection ID and confirm it belongs to the test project before uploading. Use a scoped test identity and isolate browser storage per deployment. Clean up only fixtures created by this run. A rejected origin, redirect, missing fixture or wrong project must produce zero sign-ins and zero uploads. Test these outcomes with local stubs. Assert the completed job ID, actual method, finding count, digest and review state for the uploaded image. A model job with zero boxes must fail the known-positive walkthrough. A valid empty-result fixture must pass its separate assertion.

### 2. Give both local methods one ordering rule and one transaction

Trace `src/app/actions/ai.ts`, `src/app/actions/gemini-analysis.ts`, migrations 025–026 and their SQL tests. Add a forward migration. Treat a trained result, its complete heuristic fallback, and the full heuristic invoked after Gemini unavailability as writers to the same local findings for a photo. Assign each request an ordering identity before slow inference, including the Gemini request that might fall back. Preserve explicit successful Gemini evidence as a separate source. Record the actual method, model and fallback reason atomically with the committed result. Retain backward compatibility for the current Preview client throughout deployment.

Use one consistent lock order across all routes that update the same inspection risk and image, including genuine Gemini commits. Use the same cross-method ordering rule for checking newer jobs and retiring older ones. A superseded request must leave findings, risk and maintenance tickets untouched. Preserve verified, edited and rejected decisions across method switches, with regression fixtures covering exact and overlapping crack boxes.

**Proof.** Use two database connections and controlled transaction ordering on a disposable database. Run older heuristic/newer trained and the reverse, including a late Gemini-to-heuristic fallback, plus local and successful Gemini analysis finishing concurrently on one photo. Test sibling photos in one inspection, retries after commit, an empty successful result and two different local methods proposing the same reviewed crack. Assert latest local findings, both job states, actual provenance, resulting risk, rejection persistence and ticket counts. Use bounded test timeouts to expose deadlocks. Repeat representative cases on scoped Preview fixtures.

### 3. Preserve evidence when only part of a mixed run succeeds

Implement explicit component outcomes for trained crack detection and heuristic corrosion/spalling detection. Prefer committing the successful crack result while retaining prior unreviewed corrosion/spalling evidence if that component fails. Record the partial outcome, which findings were retained and why. Alternatively fail the whole operation atomically and retain all prior findings if that fits the established job contract better. A successful zero-box response may clear stale unreviewed findings from its own component. A component exception must never stand for a clean inspection.

**Proof.** Seed a reviewed crack, an unreviewed corrosion or spalling finding, and the corresponding inspection risk. Force the heuristic to throw after trained inference succeeds. Assert that prior evidence and risk attributable to it survive; the UI identifies the failed component after reload. Then run a genuine successful empty component and verify the distinct result. Exercise disabled-model and corrupt-artifact paths to confirm full heuristic fallback and accurate attribution.

### 4. Correct bounding boxes on ordinary phone photos

Inspect `src/app/lib/ai/onnx-detector.ts`, `image-decoder.ts` and `preprocessing.ts`. Intersect both predicted corners with the actual unpadded content rectangle before inverse scaling. Drop empty intersections. Use the decoder's applied scale, padding and EXIF-corrected dimensions. Check other consumers before changing a shared helper. Avoid turning a padding-only box into a minimum-sized visible defect.

**Proof.** Test square, landscape, portrait, odd-pixel padding and EXIF-rotated images. On a 640 × 480 image resized inside 320 × 320, the top 40 rows are padding. A box in rows 5–30 must yield zero findings; one crossing row 40 must map only the visible part. Assert both corners numerically, overlay one non-square saved photo, and confirm square pilot fixtures retain their coordinates within the documented rounding tolerance.

### 5. Correct checkpoint ranking and release reporting

In `ml/train.py` count all predictions on a zero-crack image as false positives. Add small hand-calculated fixtures for empty truth with several predictions, empty predictions with positive truth, duplicate boxes, and mixed positive/negative batches. Verify that the training evaluator and release evaluator agree on like-for-like predictions, thresholds, coordinate systems and matching rules. Emit both the any-alert photo count and the correctly localized photo count with explicit names.

Re-score the retained r1/r2 checkpoints on validation only before selecting an epoch or threshold. Reuse saved weights where possible. Log original and corrected rankings, exact commands and validation counts. Report a changed checkpoint as a new candidate and checksum. Preserve the frozen test set as the historical result. If observed test errors inform new design or threshold decisions, obtain an independent held-out set before claiming a fresh release pass.

Encode the three original acceptance criteria as executable checks: positive-photo any-alert recall ≥ heuristic, box F1 at IoU 0.50 > heuristic, and total false crack boxes on reviewed negatives divided by the number of reviewed negatives ≤ 1.0. Enforce the predeclared population minima and fail closed on absent denominators. Test the boundary at 8/8 and the historical failure at 9/8, even when only 4/8 photos contain boxes. Report both false-box burden and fraction of negative photos alerted. The current candidate passes two criteria. Keep the shared Preview default on the heuristic while a required criterion fails or lacks independent evidence.

### 6. Verify and hand back the evidence

Run the focused regression tests, SQL tests on a disposable database, `npm test`, typecheck, lint and the build. Ensure lint checks project sources after a Vercel build by excluding generated `.vercel/` output; preserve genuine source warnings and errors. Check `npm run verify:preview`, apply a reviewed forward migration with `npm run db:migrate:preview`, and repeat `verify:preview`. Run the secured signed-in walkthrough on disposable fixtures. Verify shared-Preview flag-off behavior and exercise candidate success, known negative, valid empty prediction, artifact failure and recovery, partial failure, engineer rejection followed by rerun, and deliberate Gemini fallback on the isolated candidate deployment. Exercise a flag rollback and report the final state of each deployment.

Deliver a commit identifier, deployment identities, fixture cleanup results, commands and test outcomes, registry and job digests, and a case-by-case pass/fail table. Update the model card to name ONNX Runtime Web with WebAssembly on the Node server. Publish a dated correction to the release record and manuscript evidence, keeping the original evaluation traceable. Explicitly report 183/216 positive images with any crack alert, 149/216 with a valid localization, 342/2,707 annotated boxes matched and 9/8 false boxes per negative photo for the historical model. Record any blocked evidence as pending. A passed unit suite alone is insufficient for release.
