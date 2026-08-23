# AI/AR Module — Round 2 Review Feedback

**Reviewed commit:** `28bbd4ad090927a181b1f1a840b5d72920972082` — `feat(ai,ar): complete follow-up improvements for AI and AR modules`  
**Reviewer:** Claude (spec/review agent)  
**Date:** 2026-08-23  
**Constraint:** No commits made by the reviewer. No Playwright tests run.

---

## 1. Verification Summary

| Check | Result | Notes |
|---|---|---|
| `npm run build` | ✅ Passes | Next.js 16.2.6 + Turbopack compiles all 13 routes successfully. |
| TypeScript compile | ✅ Passes | No new type errors from the AI/AR additions. |
| `npm run lint` | ❌ Still broken | Pre-existing ESLint circular-config `TypeError` (predates AI/AR work). Not treated as a blocker per project convention. |
| Supabase migrations | ✅ Idempotent | `006_ai_module.sql` and `007_ar_module.sql` apply cleanly; RLS covers inspectors and admins; mock seed uses `WHERE NOT EXISTS`. |
| AI risk-score wiring | ✅ Working | `computeFinalDamageScore` is used in `ai.ts`, `ar.ts`, and `ai-analysis-panel.tsx`. Inspection risk is auto-updated after AI analysis and AR anchor creation. |
| Maintenance priority auto-creation | ✅ Working | `verifyDetection` creates a `maintenance_priorities` row for verified `high`/`critical` detections. |
| WebXR lifecycle | ✅ Improved | Session manager handles `end`, animation-frame cleanup, hit-test source cancellation, and pose telemetry. |

---

## 2. What Was Confirmed Fixed From Round 1

1. **RLS write access for inspectors** — `ai_models` remains admin-only, but `ai_damage_detections`, `ai_analysis_jobs`, `ar_sessions`, and `ar_anchors` now allow `admin` + `inspector` writes.
2. **Idempotent mock model seed** — `006_ai_module.sql` no longer relies on a missing unique constraint; it inserts only when `format = 'mock'` is absent.
3. **WebXR iOS wording** — `ar-unsupported-notice.tsx` now correctly states that immersive AR requires Chrome on Android with ARCore and that iOS needs a WebXR viewer or Capacitor wrapper.
4. **Final damage score formula** — `src/app/lib/damage-score.ts` implements `normalized × structural importance × exposure factor × location risk` and maps scores to risk levels.
5. **Re-run deduplication** — `runAIAnalysis` deletes previous detections for the image before inserting new mock results.

---

## 3. Remaining Issues / Polish Items

The prototype is **functionally end-to-end**, but the following items should be addressed before the capstone is handed off. All are small, targeted changes.

### 3.1 AR canvas is disconnected from the React-managed DOM element

**File:** `src/components/ar/ar-session-manager.tsx:100`  
**Problem:** `startSession` falls back to `document.createElement('canvas')` and assigns it to `canvasRef.current`. This replaces the `<canvas>` element actually rendered by `ar-camera-view.tsx`, so:

- The DOM canvas stays blank on non-immersive/desktop previews.
- `captureCurrentFrame()` may return an empty/transparent image because it reads from the off-screen element.
- React’s ref management can be violated by assigning a new node mid-session.

**Fix:** Remove the `document.createElement('canvas')` fallback. Use `canvasRef.current` directly; if it is `null`, throw a clear error and fail the session start gracefully. Ensure `ARCameraView` is mounted before `Start AR Session` is invoked (it is, in the current page layout).

```tsx
const canvas = canvasRef.current
if (!canvas) throw new Error('AR canvas is not mounted.')
```

### 3.2 AR page can leave an orphaned DB session if WebXR fails

**File:** `src/app/(dashboard)/ar/page.tsx` (around `handleStart`)  
**Problem:** The page inserts an `ar_sessions` row **before** requesting the WebXR immersive-AR session. If the user denies permission, ARCore is unavailable, or the device rejects the session, the DB row remains `active` forever.

**Fix:** In the `catch` block of `handleStart`, call `endARSession.mutateAsync({ sessionId: created.id })` to mark the DB session `completed` (or delete it) when WebXR start fails. Alternatively, request the WebXR session first and only persist the DB row after it succeeds.

### 3.3 Detection verification UI only supports “approve”

**File:** `src/components/ai/detection-list.tsx:47`  
**Problem:** The action `verifyDetection(detectionId, approved)` supports both `true` and `false`, but the UI only exposes a single **Verify** button. There is no way for an inspector to mark a false positive as rejected.

**Fix:** Add a secondary **Reject / False Positive** button that calls `verify.mutate({ detectionId: detection.id, approved: false })`. Visually distinguish verified-by from rejected detections (e.g., green “Verified” badge vs. slate “Rejected” badge). Update the disabled logic so a rejected detection can be re-verified if the inspector changes their mind.

### 3.4 Quick-tap-to-anchor is wired but unused

**File:** `src/components/ar/ar-camera-view.tsx:18`  
**Problem:** `ARCameraView` accepts `onTapToAnchor`, but `ar/page.tsx` never passes it. The form-based anchor creation works, but the reticle explicitly says “Tap to drop anchor” and nothing happens on tap.

**Fix options (pick one):**

- **Option A (recommended):** Wire `onTapToAnchor` from `ar/page.tsx` to a lightweight handler that calls `useCreateARAnchor().mutateAsync(...)` with the current `hitPose`, `sessionId`, and sensible defaults (`damageType='crack'`, `severity='medium'`, `label='Quick Anchor'`). This makes the tap reticle functional.
- **Option B:** Remove the `onTapToAnchor` prop and the “Tap to drop anchor” helper text if the intended UX is form-only.

### 3.5 Mock AI inference is always identical

**File:** `src/app/actions/ai.ts` (`mockInference`)  
**Problem:** Every image produces the exact same two detections (crack at 0.22,0.32 and spalling at 0.62,0.46). For a capstone demo this makes the AI look hard-coded rather than image-aware.

**Fix:** Keep the mock deterministic, but vary outputs by `imageId` so different assets show different defects. A lightweight hash of `imageId` can choose from a small catalog of bounding boxes and damage types while still guaranteeing 1–2 detections.

Example approach:

```ts
const catalog = [
  { damage_type: 'crack', severity: 'high', severity_score: 75, confidence: 0.92, bbox: {...} },
  { damage_type: 'spalling', severity: 'medium', severity_score: 50, confidence: 0.85, bbox: {...} },
  { damage_type: 'corrosion', severity: 'medium', severity_score: 55, confidence: 0.81, bbox: {...} },
  { damage_type: 'deformation', severity: 'low', severity_score: 35, confidence: 0.74, bbox: {...} },
]
// use imageId hash to pick 1-2 items deterministically
```

This is purely demo polish; the real model swap is still Phase 5 work.

### 3.6 AI aggregate score uses default structural multipliers

**File:** `src/components/ai/ai-analysis-panel.tsx` (around `damageScore`)  
**Problem:** The panel shows a single impact score computed with `structuralImportance=1.2`, `exposureFactor=1.0`, `locationRiskFactor=1.0`. There is no UI to adjust these multipliers, and no explanation that they are defaults.

**Fix:** Add a small inline hint under the score:

> “Score uses default structural, exposure, and location factors. Configurable weighting is a production follow-up.”

This sets correct expectations for capstone reviewers without adding new UI complexity.

---

## 4. Non-Issues / Accepted Prototype Limitations

The following are **intentional capstone-prototype limitations** and should not be treated as blockers. Document them in the final README/presentation notes.

- **WebXR overlay projection is approximate.** `ar-overlay.tsx` projects anchors into 2D using a simple depth-scaled transform, not true camera intrinsics. Real ARKit/ARCore anchoring would require native bridges.
- **No real model inference.** `runAIAnalysis` uses deterministic mock results. ONNX/TensorFlow.js integration is explicitly future work.
- **No camera snapshot persistence for AR anchors.** `snapshot_path` is stored as `null`; saving a real frame from WebXR requires Capacitor/native access.
- **ESLint config failure is pre-existing.** It does not affect the build or runtime and should not block the capstone demo.

---

## 5. Sign-Off Condition

The capstone implementation can be considered **complete for prototype/demo purposes** once items **3.1–3.4** are fixed. Items **3.5–3.6** are optional but strongly recommended for a stronger demo.

After the implementer finishes, run:

```bash
npm run build
```

and confirm zero TypeScript/build errors. Do **not** block on `npm run lint`.
