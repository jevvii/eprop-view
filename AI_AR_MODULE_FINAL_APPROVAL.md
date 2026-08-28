# AI/AR Module — Final Review & Capstone Approval

**Reviewed commit:** `b437880` — `fix(ai,ar): round 2 polish — canvas ref, AR lifecycle, verify UI, tap-to-anchor`  
**Previous baseline:** `28bbd4a` — `feat(ai,ar): complete follow-up improvements for AI and AR modules`  
**Reviewer:** Claude (spec/review agent)  
**Date:** 2026-08-23  
**Status:** ✅ Approved for capstone prototype/demo

---

## 1. Verification Summary

| Check | Result | Notes |
|---|---|---|
| `npm run build` | ✅ Passes | Next.js 16.2.6 + Turbopack, 13 routes generated, zero TypeScript errors. |
| TypeScript compile | ✅ Passes | No new errors from Round 2 changes. |
| `npm run lint` | ❌ Still broken | Pre-existing ESLint circular-config `TypeError`. Not a blocker for the capstone. |
| Round 2 required fixes (3.1–3.4) | ✅ All addressed | Canvas ref, orphaned AR session, reject verification, tap-to-anchor. |
| Round 2 optional fixes (3.5–3.6) | ✅ Both addressed | Mock inference varies by `imageId`; AI score default-multiplier caveat added. |
| Migration idempotency | ✅ Confirmed | `006_ai_module.sql` and `007_ar_module.sql` unchanged in this round; still safe to re-run. |

---

## 2. Required Fixes Confirmed Fixed

### 2.1 AR canvas is now the React-mounted DOM element
**File:** `src/components/ar/ar-session-manager.tsx`

The off-screen `document.createElement('canvas')` fallback was removed. `startSession` now reads `canvasRef.current` directly and throws a clear error if `ARCameraView` is not mounted. This fixes blank canvas issues and makes `captureCurrentFrame()` reliable.

### 2.2 Orphaned DB AR sessions are cleaned up on WebXR failure
**File:** `src/app/(dashboard)/ar/page.tsx`

`handleStart` tracks `createdSessionId` and calls `endARSession.mutateAsync(...)` inside the catch block if WebXR start fails. The local `dbSessionId` state is also cleared.

### 2.3 Detection verification supports approve and reject
**File:** `src/components/ai/detection-list.tsx`

The UI now exposes:
- **Verify / Re-Verify** button for unverified or rejected detections.
- **Reject** button for verified or unverified detections.
- Visual badges for `✓ Verified` and `✗ False Positive`.
- Notes are persisted through `verifyDetection` so state can be inferred client-side.

### 2.4 Quick-tap-to-anchor is wired and functional
**File:** `src/app/(dashboard)/ar/page.tsx` + `src/components/ar/ar-camera-view.tsx`

`ARPageContent` passes `handleTapToAnchor` into `ARCameraView`. When a surface is detected (`hitPose` exists), a tap drops a persisted anchor with sensible defaults (`damageType: 'crack'`, `severity: 'medium'`, auto-incremented label). A console warning is emitted if the user taps before a surface is locked.

---

## 3. Optional Polish Confirmed Added

### 3.1 Deterministic but varied mock inference
**File:** `src/app/actions/ai.ts`

`mockInference(imageId)` now hashes the image UUID to choose 1–2 defects from a 5-item catalog (crack, spalling, corrosion, leakage, deformation). Different inspection images show different bounding boxes and severity scores, which makes the demo look image-aware while remaining stable across re-runs.

### 3.2 Default score caveat in AI panel
**File:** `src/components/ai/ai-analysis-panel.tsx`

An italic note below the impact score explains that default structural (1.2×), exposure (1.0×), and location factors are used, and that configurable weighting is a production follow-up.

---

## 4. Remaining Known Limitations (Prototype-Only, Not Blockers)

The following are explicit capstone-prototype limitations. They should be documented in the final README/presentation but do **not** require another code round.

1. **Rejection state is inferred from the `notes` string.** There is no dedicated `status` column on `ai_damage_detections`. This is acceptable for the demo but should be replaced by an explicit `status` enum (`pending`, `verified`, `rejected`) in production.
2. **Rejecting a verified detection does not delete its auto-created maintenance priority.** The priority created during verification remains in `maintenance_priorities`. Production should either soft-delete it or add a rejection workflow to the priority table.
3. **AR overlay projection is approximate.** `ar-overlay.tsx` uses a simple depth-scaled 2D projection, not true camera intrinsics. Native ARKit/ARCore anchoring is a future bridge.
4. **No real AI model inference.** The classifier is deterministic mock logic. ONNX Runtime Web / TensorFlow.js integration is documented as Phase 5 follow-up in `AI_AR_MODULE_IMPLEMENTATION_PLAN.md`.
5. **ESLint config error is pre-existing.** `npm run lint` fails with a circular JSON `TypeError` unrelated to the AI/AR modules.

---

## 5. Sign-Off

The AI Module (Section 2) and AR Module (Section 3) of the EPROPVIEW capstone prototype are **functionally complete and approved**.

No further review rounds are required unless the user wants to add new features beyond the agreed scope.
