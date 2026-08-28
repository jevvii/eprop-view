# Implementer Handoff — Round 2 (AI/AR Module Polish)

**Goal:** Apply the remaining Round 2 feedback items to the AI and AR modules, verify the build, commit the changes, push them, and rebuild the handover zip.

**Source of truth for fixes:** `AI_AR_MODULE_FEEDBACK_ROUND2.md` (project root).

---

## 1. Required Fixes (complete before commit)

### A. Fix AR canvas DOM disconnect

**File:** `src/components/ar/ar-session-manager.tsx`

- Remove the `document.createElement('canvas')` fallback inside `startSession`.
- Use `canvasRef.current` directly.
- If `canvasRef.current` is `null`, throw a clear error so the session start fails gracefully.

Reference line from current commit: `src/components/ar/ar-session-manager.tsx:100` (`canvas = document.createElement('canvas')`).

### B. Prevent orphaned DB AR sessions on WebXR failure

**File:** `src/app/(dashboard)/ar/page.tsx`

- In the `handleStart` catch block, if a DB session row was already created, call `endARSession.mutateAsync({ sessionId: created.id })` to mark it completed/ended before the error propagates.
- Alternatively, reverse the order: start WebXR first, then create the DB session only after the WebXR session succeeds.

### C. Add reject / false-positive verification UI

**File:** `src/components/ai/detection-list.tsx`

- Add a **Reject** (or **False Positive**) button next to the existing **Verify** button.
- Call `verify.mutate({ detectionId: detection.id, approved: false })` for rejections.
- Visually distinguish:
  - verified detections → green/positive badge,
  - rejected detections → slate/neutral badge,
  - unverified detections → action buttons enabled.
- Allow a rejected detection to be re-verified and vice-versa.

### D. Wire quick-tap-to-anchor in AR view

**File:** `src/app/(dashboard)/ar/page.tsx` + `src/components/ar/ar-camera-view.tsx`

- Pass an `onTapToAnchor` handler from the page into `ARCameraView`.
- The handler should call `useCreateARAnchor().mutateAsync(...)` using the current `hitPose`, the active `dbSessionId`, and `inspectionId`, with sensible defaults (`damageType: 'crack'`, `severity: 'medium'`, `label: 'Quick Anchor'`).
- Make sure `hitPose` is present before mutating; if not, show a brief toast/console warning.

If the decision is to keep AR anchor creation form-only, remove `onTapToAnchor` and the “Tap to drop anchor” helper text instead.

---

## 2. Optional but Recommended Fixes

### E. Vary deterministic mock AI inference by image

**File:** `src/app/actions/ai.ts` (`mockInference` function)

- Keep results deterministic so the demo is stable, but use a lightweight hash of `imageId` to pick from a catalog of damage types and bounding boxes.
- Still guarantee 1–2 detections per image.

### F. Add default-multiplier caveat to AI impact score

**File:** `src/components/ai/ai-analysis-panel.tsx`

- Add a one-line note under the aggregate score explaining that it uses default structural, exposure, and location factors.

---

## 3. Verification Steps

After applying the fixes, run:

```bash
npm run build
```

Expected result: clean production build with all routes generated.

```bash
npm run lint
```

Expected result: still fails with the **pre-existing** circular-config `TypeError`. This is **not a blocker** — do not try to fix ESLint config in this handoff.

Confirm TypeScript has no new errors and all AI/AR imports resolve.

---

## 4. Git & Handover Workflow

1. Make sure you are on the feature branch created in Round 1 (or create a new branch from it).
2. Stage only the relevant files:

   ```bash
   git add src/components/ar/ar-session-manager.tsx
   git add src/app/(dashboard)/ar/page.tsx
   git add src/components/ai/detection-list.tsx
   git add src/app/actions/ai.ts
   git add src/components/ai/ai-analysis-panel.tsx
   # and any other files you touched
   ```

3. Commit with a descriptive message:

   ```bash
   git commit -m "fix(ai,ar): round 2 polish — canvas ref, AR lifecycle, verify UI, tap-to-anchor

   - Use the React-mounted AR canvas instead of an off-screen element
   - End orphaned DB AR sessions when WebXR start fails
   - Add reject/false-positive detection verification button
   - Wire quick-tap-to-anchor UX on the AR camera reticle
   - (Optional) vary mock inference by imageId for demo realism
   
   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

4. Push the branch:

   ```bash
   git push origin <branch-name>
   ```

5. Rebuild the handover zip from the project root:

   ```bash
   rm -f eprop-view-handover.zip
   zip -r eprop-view-handover.zip . -x "node_modules/*" ".git/*" ".next/*" "*.log"
   ```

6. Report back with:
   - the commit hash,
   - confirmation that `npm run build` passes,
   - the path to the rebuilt zip,
   - a note on any items skipped (optional E/F).

---

## 5. Do Not Do

- Do **not** run Playwright tests in this handoff.
- Do **not** attempt to fix the pre-existing ESLint config error.
- Do **not** refactor unrelated modules.
- Do **not** commit the handover zip unless your workflow requires it.
