# EPROPVIEW AI + AR Modules — Follow-Up Spec

**Date:** 2026-08-23  
**Status:** Review completed; critical RLS issues fixed; remaining items need implementer agent action  
**Related docs:**
- `AI_AR_MODULE_IMPLEMENTATION_PLAN.md` — original implementation plan
- `IMPLEMENTER_HANDOFF.md` — branch/push/zip checklist
- `docs/sys_module_description.md` — system module specification

---

## 1. Review Summary

The AI and AR module scaffolding has been implemented and builds successfully (`npm run build` ✅). This follow-up spec documents the issues found during review, the fixes already applied, and the remaining work the implementer agent must complete before the feature branch can be considered production-ready.

---

## 2. Critical Fixes Already Applied

The following issues were identified and fixed in this review pass. They are already in the working tree (uncommitted).

### 2.1 RLS Policies — Inspectors Could Not Write AI/AR Data

**Issue:** The new `ai_damage_detections`, `ai_analysis_jobs`, `ar_sessions`, and `ar_anchors` tables only had `admin_all` write policies. Because the server-side Supabase client uses the anon key (not the service role key) for normal server actions, non-admin users (inspectors) would have been blocked from running AI analysis or saving AR anchors.

**Fix:** Added `inspector_all` policies to all four operational tables so admins and inspectors can insert/update, while viewers remain read-only. Kept `admin_all` policies for full admin control.

**Files changed:**
- `supabase/migrations/006_ai_module.sql`
- `supabase/migrations/007_ar_module.sql`

### 2.2 Mock Model Seed Was Not Idempotent

**Issue:** `006_ai_module.sql` inserted a mock model on every migration run using `ON CONFLICT DO NOTHING`, but `ai_models` had no unique constraint. This would have created duplicate mock model rows every time the migration was re-applied.

**Fix:** Replaced the insert with an idempotent `INSERT ... WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE format = 'mock')`.

**File changed:**
- `supabase/migrations/006_ai_module.sql`

### 2.3 Misleading WebXR Browser Support Notice

**Issue:** `ARUnsupportedNotice` claimed Safari on iOS 17+ supports WebXR immersive AR. iOS Safari does **not** natively support WebXR immersive AR; it requires a WebXR viewer app or a native wrapper.

**Fix:** Updated the notice to accurately state that immersive AR is best supported on Chrome for Android with ARCore, and iOS requires a WebXR viewer or Capacitor wrapper.

**File changed:**
- `src/components/ar/ar-unsupported-notice.tsx`

---

## 3. Remaining Issues for Implementer Agent

### 3.1 AR Rendering Pipeline Is Not Functional

**Issue:** The current AR page requests a WebXR `immersive-ar` session, but:
- `ARSessionManager` never creates an `XRWebGLLayer` or binds a `<canvas>` to the session.
- `ARCameraView` only renders a placeholder `<div>`; it does not draw the camera frame or the WebXR compositor output.
- `AROverlay` positions every anchor label at a fixed screen coordinate (`left-1/2 top-1/3`) instead of reprojecting the anchor pose into screen space.
- `ARAnchorForm` always submits a hardcoded pose `{ position: {0,0,-1}, quaternion: identity }`. It does not use WebXR hit-test results to place anchors on real surfaces.

**Impact:** The AR Module satisfies the data model and UI wiring, but the live AR experience described in Section 3 of the spec (surface tracking, real-time overlays, spatial anchoring) is not yet functional.

**Recommended fix:**
1. In `ARSessionManager`:
   - After `requestSession`, create a WebGL context and an `XRWebGLLayer`.
   - Set up a render loop via `session.requestAnimationFrame`.
   - Request `hit-test` reference space (`viewer`) and a `local-floor` reference space.
2. In `ARCameraView`:
   - Render into the WebXR layer. The browser compositor will show the camera background automatically for `immersive-ar`.
   - Draw a reticle at the current hit-test result.
3. In `ARPage`:
   - Pass hit-test results / selected pose into `ARAnchorForm`.
4. In `ARAnchorForm`:
   - Accept an optional `hitPose` prop and use it instead of the hardcoded pose.
5. In `AROverlay`:
   - Accept the current `XRFrame` and `XRReferenceSpace` to reproject each anchor's `pose` into screen coordinates, or render labels inside the WebGL scene as billboards.

**References:**
- WebXR Device API: https://immersive-web.github.io/webxr/
- WebXR Hit Testing: https://immersive-web.github.io/hit-test/

---

### 3.2 Final Damage Score (Section 4) Is Not Implemented

**Issue:** The spec defines a final damage score combining AI severity, structural importance multiplier, exposure factor, and location risk factor. No code computes or stores this score.

**Impact:** The `inspections.risk_score` and `risk_level` fields remain manually entered values. AI/AR findings do not feed into the existing risk workflow.

**Recommended fix:**
1. Add a helper function in `src/app/lib/damage-score.ts`:
   ```ts
   export function computeFinalDamageScore(
     aiSeverityScore: number,
     structuralImportance: number,
     exposureFactor: number,
     locationRiskFactor: number,
   ): number {
     const normalized = (aiSeverityScore / 100) * 10
     const weighted = normalized * structuralImportance * exposureFactor * locationRiskFactor
     return Math.min(10, Math.max(0, Number(weighted.toFixed(2))))
   }
   ```
2. Add an input to `AIAnalysisPanel` or `ARAnchorForm` for structural importance, exposure factor, and location risk factor (or derive location risk from the project's `environmental_risks`).
3. On verified AI detection or AR anchor save, recalculate and update the parent `inspections.risk_score` and `risk_level`.
4. Map 0–10 score to `low` / `moderate` / `high` / `critical` to match existing `RiskLevel`.

---

### 3.3 Maintenance Prioritization (Section 5) Is Not Wired to AI Results

**Issue:** The spec says the maintenance module should consume AI severity score, structural importance, geohazard risk, and AR location tag to produce a priority queue. Currently, high/critical AI detections do not auto-create maintenance tasks.

**Impact:** Inspectors must manually transcribe AI findings into the maintenance backlog.

**Recommended fix:**
1. In `src/app/actions/ai.ts`, extend `runAIAnalysis` or add a new `createMaintenanceFromDetection` server action.
2. For every verified detection with severity `high` or `critical`, insert a `maintenance_priorities` row:
   - `project_id` from the parent inspection
   - `title`: `"AI-detected ${damageType} — ${severity}`
   - `risk_score`: the final damage score
   - `status`: `pending`
   - `due_date`: compute from severity (e.g., critical = +7 days, high = +14 days)
   - `notes`: link to image/detection IDs
3. Invalidate `['maintenance']` queries after creation.

---

### 3.4 Reports and Dashboard Do Not Display AI/AR Evidence

**Issue:** Phase 6 integration is incomplete. `report-form.tsx`, `print-report.tsx`, `damage-trend-chart.tsx`, and `risk-hotspots.tsx` do not consume `ai_damage_detections` or `ar_anchors`.

**Impact:** Reports cannot include AI-detected damage, severity scores, confidence levels, or AR snapshots as required by Section 9.

**Recommended fix:**
1. Reports:
   - Add an “AI Findings” section to `ReportForm`/`PrintReport` that lists detections for the linked inspection's images.
   - Include aggregate severity distribution.
   - Render AR snapshot thumbnails from `ar_anchors.snapshot_path` (use signed URLs).
2. Dashboard:
   - Extend `DamageTrendChart` to show AI-detected damage counts over time.
   - Extend `RiskHotspots` to include `ar_anchors` with GPS coordinates and `ai_damage_detections` linked to images with geotags.

---

### 3.5 AI Analysis Re-Runs Append Detections Instead of Replacing Them

**Issue:** Each call to `runAIAnalysis` inserts new `ai_damage_detections` rows. There is no cleanup of old detections for the same image/model.

**Impact:** Re-running analysis on the same image creates duplicate/overlapping bounding boxes.

**Recommended fix:**
1. Before inserting new detections in `runAIAnalysis`, delete existing detections for the same `image_id` and `model_id`:
   ```sql
   DELETE FROM ai_damage_detections
   WHERE image_id = <imageId> AND model_id = <modelId>;
   ```
2. Or, add a unique constraint on `(image_id, model_id)` and use `upsert` if detections are treated as a single result set per image/model.

---

### 3.6 Mock AI Classifier Is Non-Deterministic and May Return Zero Detections

**Issue:** `mockInference()` randomly skips `'none'` damage types. With a small `resultCount` (1–3), it is possible (though unlikely) to produce zero detections.

**Impact:** Demo may occasionally show “No detections” unexpectedly.

**Recommended fix:**
1. Ensure at least one non-`none` detection is returned in mock mode.
2. Or, replace the mock with a deterministic demo set:
   ```ts
   return [
     { damage_type: 'crack', severity: 'high', severity_score: 75, confidence: 0.91, bbox: { x: 0.2, y: 0.3, width: 0.4, height: 0.1 } },
     { damage_type: 'spalling', severity: 'medium', severity_score: 50, confidence: 0.84, bbox: { x: 0.6, y: 0.5, width: 0.2, height: 0.2 } },
   ]
   ```
3. Document the mock behavior and the path to real model integration in `README.md` or a new `AI_MODEL_INTEGRATION.md`.

---

### 3.7 AR Session Lifecycle Is Fragile

**Issue:** In `src/app/(dashboard)/ar/page.tsx`:
- `handleStart` starts the WebXR session first, then creates the DB session. If the DB insert fails, an active WebXR session is left with no persisted record.
- `handleEnd` ends WebXR first, then updates the DB. If the DB update fails, the WebXR session is closed but the DB still marks it `active`.

**Recommended fix:**
1. Create the DB `ar_sessions` row **first** with status `active`.
2. Only then request the WebXR session.
3. On end, update the DB row to `completed` **before** calling `session.end()`.
4. Add an `onSessionEnded` listener in `ARSessionManager` that calls a cleanup callback so the page can mark the DB session completed even if the user exits via the XR runtime UI.

---

### 3.8 Missing Server-Side Model Registry Validation

**Issue:** `runAIAnalysis` accepts an optional `modelId` and falls back to the first active model. It does not validate that the requested model exists or is active.

**Recommended fix:**
1. Query `ai_models` for the requested `modelId`.
2. Throw a clear error if the model is missing or `is_active = false`.
3. If no `modelId` is supplied and no active mock/real model exists, return a user-friendly error instead of creating a job that fails.

---

### 3.9 AR Anchor Form Does Not Link to AI Detections

**Issue:** `ARAnchorForm` manually selects `damageType` and `severity`. The spec's Section 3.2 “AR + AI Fusion” expects the AR anchor to be populated by AI inference from the camera frame.

**Recommended fix:**
1. Add a “Run AI on current view” button in the AR page.
2. Capture a still frame from the WebXR session (via `XRFrame` + WebGL readPixels, or the camera feed if accessible).
3. Run the same `runAIAnalysis` server action against a temporary `inspection_images` row or a frame upload.
4. Pass the resulting `detection_id` to `createARAnchor` so the anchor is linked to the AI detection.
5. Auto-fill `damage_type`, `severity`, and `label` from the detection.

---

### 3.10 `ai_damage_detections.mask_url` Is Unused

**Issue:** The table has a `mask_url` column for segmentation masks, but no component displays masks.

**Recommended fix:**
1. If/when a segmentation model is integrated, store mask signed URLs in `mask_url`.
2. Render masks in `DamageOverlay` as an SVG `<path>` or canvas overlay above the image.
3. For the prototype, either leave the column for future use or hide mask UI entirely.

---

## 4. Optional Improvements

| Item | Rationale |
| --- | --- |
| **Add `@types/webxr` dependency** | The custom `src/types/webxr.d.ts` is minimal. Replacing it with the official `@types/webxr` package gives better coverage and is less maintenance. |
| **Add real model dependencies** | `onnxruntime-web`, `@tensorflow/tfjs`, and `three` are not yet in `package.json`. Add them only when real model/3-D rendering is wired. |
| **Pagination for detection list** | If an image has many detections, the list could grow long. Add virtual scrolling or pagination. |
| **Deletion of AI detections** | Add a server action + UI button to delete a detection, with RBAC enforcement. |
| **Batch AI analysis** | Allow running AI on all images in an inspection at once. |
| **Audit trail for AI/AR** | Add `created_by` columns to `ai_damage_detections`, `ai_analysis_jobs`, `ar_anchors`, and `ar_sessions` for full provenance. |
| **EXIF extraction** | The Image Module spec calls for EXIF extraction. This is outside the AI/AR scope but should be tracked as a separate feature. |

---

## 5. Implementer Agent Action Checklist

Before branching/committing/pushing per `IMPLEMENTER_HANDOFF.md`, the implementer agent should:

- [ ] Confirm the RLS policy fixes in `006_ai_module.sql` and `007_ar_module.sql` are present.
- [ ] Implement the AR rendering pipeline (WebGL layer, hit-test, pose reprojection) or clearly document it as a known limitation.
- [ ] Implement final damage score calculation and update parent inspection risk score.
- [ ] Wire high/critical AI detections to auto-create maintenance priorities.
- [ ] Add AI/AR evidence to reports and dashboard.
- [ ] Fix AI analysis re-run duplication (delete old detections or upsert).
- [ ] Make mock inference deterministic or at least guarantee ≥1 detection.
- [ ] Harden AR session lifecycle (DB session first, cleanup callback on XR end).
- [ ] Validate requested `modelId` in `runAIAnalysis`.
- [ ] (Optional) Implement AR + AI fusion by capturing a frame and running inference.
- [ ] Run `npm run build` and confirm it passes.
- [ ] Do **not** run Playwright.
- [ ] Follow the branch/commit/push/zip instructions in `IMPLEMENTER_HANDOFF.md`.

---

## 6. Known Limitations to Document for Client

1. **AI inference is mock-only** in this prototype. Real training and model export are required for production.
2. **AR is WebXR-based**, not native ARKit/ARCore. Indoor SLAM quality and persistence depend on the browser/device.
3. **Deformation detection** has no open-source RGB dataset; it is currently a manual label.
4. **WebXR AR** requires a compatible Android device with Chrome + ARCore for the live camera overlay to function.
5. **ESLint** currently fails due to a pre-existing configuration issue unrelated to these modules.

---

*End of follow-up spec.*
