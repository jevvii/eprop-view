# EPROPVIEW — AI Module & AR Module Implementation Plan

**Version:** 1.0.0  
**Date:** 2026-08-23  
**Status:** Capstone prototype specification — ready for implementer agent  
**Source document:** `docs/sys_module_description.docx` (converted to `docs/sys_module_description.md`)  
**Research notebook:** NotebookLM notebook *"EPROPVIEW AI Module: Open-Source Structural Damage Datasets"* (ID: `88c57e96-47a4-4668-acc0-921032364009`)

---

## 1. Executive Summary

This plan implements the two missing core features from the EPROPVIEW system specification:

- **Section 2 — AI Module (Core Feature):** automated damage detection (crack, corrosion, spalling, deformation, leakage), severity classification, object detection with bounding boxes, and AI output persistence.
- **Section 3 — AR Module (Core Feature):** browser-based AR inspection mode, AR + AI fusion overlays, spatial anchoring of detections, and indoor mapping helpers.

Because EPROPVIEW is a **Next.js 16 web application**, the native mobile ARKit/ARCore toolchains referenced in the spec are replaced with the **WebXR Device API** for camera access, hit-testing, and 3-D overlay rendering. This keeps the capstone prototype deployable from a single web codebase while still satisfying the functional intent of the AR Module.

This document is both an **engineering plan** and an **implementer-agent handoff spec**. It includes:

- Open-source dataset recommendations from NotebookLM research.
- New Supabase/PostGIS schema.
- TypeScript type additions.
- Server Actions / API routes.
- React component architecture.
- Step-by-step implementation order.
- Known caveats and prototype limitations.

> **Implementer-agent instructions at the end (Section 10):** after coding, push the branch and rebuild `eprop-view-handover.zip`.

---

## 2. Scope & Prototype Assumptions

| Aspect | Prototype Decision |
| --- | --- |
| **Target platform** | Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS v4 |
| **Database** | Supabase PostgreSQL 15 + PostGIS (existing) |
| **AI runtime** | Client-side inference with **ONNX Runtime Web** (`onnxruntime-web`) or **TensorFlow.js** (`@tensorflow/tfjs`). A mock/demo classifier is acceptable for the first build so the UI and data flow can be demonstrated without a trained model. |
| **AR runtime** | **WebXR Device API** + a lightweight 3-D overlay layer (e.g., raw WebGL or `three.js`) for hit-test anchoring. ARCore/ARKit native integration is out of scope for this web prototype. |
| **Damage classes** | `crack`, `corrosion`, `spalling`, `deformation`, `leakage`, plus severity levels `low`, `medium`, `high`, `critical`. |
| **Bounding boxes** | Normalized `[x, y, width, height]` relative to source image dimensions (0–1). |
| **Spatial anchors** | Relative 6-DOF pose stored as JSON; GPS coordinates optional for outdoor re-anchoring. |
| **Commit strategy** | Do **not** commit in this session. The implementer agent should branch, commit, and push per Section 10. |
| **Testing** | Do **not** run Playwright. Verify with `npm run build` and manual browser checks only. |

---

## 3. AI Module — Open-Source Dataset Research

NotebookLM fast research surfaced the datasets below. For a capstone prototype, prioritize datasets that are **publicly downloadable**, **permissively licensed**, and **annotated with bounding boxes or segmentation masks** that map directly to the required damage classes.

### 3.1 Recommended Datasets by Damage Type

| Damage Type | Dataset | License | Size / Format | Best Architecture | Notes |
| --- | --- | --- | --- | --- | --- |
| **Crack** | **Cracks in the Foundation (CiF)** — [arXiv:2605.18413](https://arxiv.org/abs/2605.18413) | CC BY 4.0 | 12,896 full images (~150 k 1024×1024 tiles); polygon instance masks | YOLOv11 / YOLOv26 / RF-DETR / Mask-DINO | Best all-around crack benchmark; preserves native multi-megapixel resolution. |
| **Crack** | **StructDamage** — [DFKI Cloud](https://cloud.dfki.de/owncloud/index.php/s/WNiPcgMnZL9p9rR) | CC BY 4.0 | ~78,093 images across 9 surface types; folder-level classification | DenseNet201 / ResNet101V2 / ViT-B/32 | Excellent for material-aware classification. |
| **Crack** | **CrackSeg9k** — [arXiv:2208.13054](https://arxiv.org/abs/2208.13054) | CC BY 4.0 | 2,003 full / 9,255 patch images; semantic segmentation | U-Net / DeepCrack | Compact and ready for segmentation. |
| **Corrosion** | **CONCORNET2023** — [GitHub](https://github.com/JaGuzmanT/CONCORNET2023) | MIT | 790 smartphone images; bounding boxes | YOLOv3 / YOLOv8 | Smartphone-captured, real-world variety. |
| **Corrosion / Exposed Rebar** | **CODEBRIM** — [Zenodo](https://doi.org/10.5281/zenodo.2620293) | Research / Academic | 1,590 images; 5,354 bounding boxes; multi-label | DenseNet / VGG / MetaQNN | Multi-target concrete bridge defects (crack, spallation, efflorescence, exposed bars, corrosion stain). |
| **Spalling** | **S2DS** — [DAGM GCPR paper](https://link.springer.com/chapter/10.1007/978-3-031-16788-1_21) | GPL-3.0 | 743 high-resolution patches; 1024×1024 semantic segmentation | U-Net / attention models | Includes spalling, corrosion, efflorescence, vegetation, control point. |
| **Leakage** | **dacl10k** — [arXiv:2309.00460](https://arxiv.org/abs/2309.00460) | CC BY-NC 3.0 | 9,920 bridge images; 19 semantic classes incl. seepage / wet areas | YOLOv8-Seg / U-Net | Large bridge damage segmentation benchmark. |
| **Leakage** | **GYU-DET** — [Scientific Data](https://doi.org/10.1038/s41597-025-05395-w) | CC BY 4.0 | 11,123 beam bridge images; bounding boxes | YOLOv11 / Faster R-CNN | Includes seepage class. |
| **Deformation** | — | **Dataset gap** | No dedicated open-source RGB deformation dataset | N/A | Deformation is better tracked by 3-D point-cloud / NDT methods or inferred from displacement over repeat visits. For the prototype, treat `deformation` as a manual classification label or use displacement metrics from repeat AR anchors. |

### 3.2 Preprocessing & Training Notes for the Implementer Agent

1. **Tiled inference is mandatory.** High-resolution inspection images must be sliced into 1024×1024 patches with overlap before inference; hairline cracks vanish when whole images are downsampled to 640 px.
2. **Deduplicate with perceptual hashing (pHash).** Use a Hamming-distance threshold (< 30 %) to remove redundant drone/video frames before training.
3. **Balance classes.** Crack classes dominate most datasets; subsample majority classes and augment minority classes (rotation ±70°, flips, perspective, contrast jitter, blur).
4. **Export to web-friendly formats.** Train in PyTorch/TensorFlow, then export to:
   - **ONNX** (`yolov8n.onnx` / `yolov11n.onnx`) for object detection with `onnxruntime-web`.
   - **TensorFlow.js** (`model.json`) for patch classification with `@tensorflow/tfjs`.

### 3.3 Prototype Model Choice

For the **first prototype build**, use one of these lightweight options so the UI and data layer can be wired end-to-end:

| Use Case | Model | Library | Rationale |
| --- | --- | --- | --- |
| Multi-class damage classification | MobileNetV2 fine-tuned on StructDamage/CODEBRIM patches | TensorFlow.js | Very small, fast, easy to deploy; good for `crack / corrosion / spalling / leakage / none`. |
| Object detection + bounding boxes | YOLOv8n or YOLOv11n exported to ONNX | `onnxruntime-web` | Industry standard; runs in browser with WebGL/WebGPU acceleration; supports SAHI tiling. |
| Segmentation masks (stretch goal) | SCSegamba (2.8 M params) or U-Net | ONNX / TensorFlow.js | Pixel-level crack maps for advanced reports. |

> **Prototype fallback:** if model export/training is not completed in time, ship a **mock AI service** that returns plausible damage detections with configurable confidence so the rest of the application (DB, UI, AR overlay, reports) can be demonstrated.

---

## 4. AI Module — Data Model

### 4.1 New Tables

Add a new migration file `supabase/migrations/006_ai_module.sql`.

```sql
-- AI damage detection results attached to inspection images
CREATE TABLE ai_damage_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES inspection_images(id) ON DELETE CASCADE,
  model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  damage_type text NOT NULL CHECK (damage_type IN ('crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  severity_score float NOT NULL CHECK (severity_score >= 0 AND severity_score <= 100),
  confidence float NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  bbox jsonb,                       -- { x, y, width, height } normalized 0-1
  mask_url text,                    -- optional segmentation mask signed URL
  verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Registered AI models / checkpoints
CREATE TABLE ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  task text NOT NULL CHECK (task IN ('classification', 'detection', 'segmentation')),
  format text NOT NULL CHECK (format IN ('tfjs', 'onnx', 'mock')),
  storage_path text,                -- path in Supabase storage to model artifact
  labels text[] NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Per-image AI analysis job queue / status
CREATE TABLE ai_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id uuid NOT NULL REFERENCES inspection_images(id) ON DELETE CASCADE,
  model_id uuid REFERENCES ai_models(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  error_message text DEFAULT '',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ai_detections_image_id_idx ON ai_damage_detections(image_id);
CREATE INDEX ai_detections_damage_type_idx ON ai_damage_detections(damage_type);
CREATE INDEX ai_detections_severity_idx ON ai_damage_detections(severity);
CREATE INDEX ai_models_active_idx ON ai_models(is_active);
CREATE INDEX ai_jobs_image_id_idx ON ai_analysis_jobs(image_id);
CREATE INDEX ai_jobs_status_idx ON ai_analysis_jobs(status);

ALTER TABLE ai_damage_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_jobs ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read AI results; only admins can manage models
CREATE POLICY "ai_detections_select_all" ON ai_damage_detections FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_detections_admin_all" ON ai_damage_detections FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "ai_models_select_all" ON ai_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_models_admin_all" ON ai_models FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "ai_jobs_select_all" ON ai_analysis_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_jobs_admin_all" ON ai_analysis_jobs FOR ALL TO authenticated USING (get_my_role() = 'admin');
```

### 4.2 TypeScript Types

Append to `src/app/types/index.ts`:

```ts
export type DamageType = 'crack' | 'corrosion' | 'spalling' | 'deformation' | 'leakage' | 'none'
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'
export type AIModelTask = 'classification' | 'detection' | 'segmentation'
export type AIModelFormat = 'tfjs' | 'onnx' | 'mock'
export type AIJobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface AIModel {
  id: string
  name: string
  version: string
  task: AIModelTask
  format: AIModelFormat
  storage_path: string | null
  labels: string[]
  is_active: boolean
  created_at: string
}

export interface AIDamageDetection {
  id: string
  image_id: string
  model_id: string | null
  damage_type: DamageType
  severity: SeverityLevel
  severity_score: number
  confidence: number
  bbox: BoundingBox | null
  mask_url: string | null
  verified_by: string | null
  verified_at: string | null
  notes: string
  created_at: string
}

export interface AIAnalysisJob {
  id: string
  image_id: string
  model_id: string | null
  status: AIJobStatus
  error_message: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}
```

---

## 5. AI Module — Architecture

### 5.1 Inference Flow

```text
1. Inspector uploads image to Asset Vault
2. UI calls runAIAnalysis(imageId, modelId)
3. Server Action / API:
   a. Fetches signed image URL
   b. Loads client-side model (ONNX/TF.js) or runs mock
   c. Runs tiled inference (SAHI if detection)
   d. Maps raw outputs to AIDamageDetection rows
4. Rows inserted into ai_damage_detections
5. UI overlays bounding boxes + severity labels on image
6. Optional: inspector verifies / edits results
```

### 5.2 Server Actions / API

Create `src/app/actions/ai.ts`:

| Export | Purpose |
| --- | --- |
| `getActiveAIModels()` | Returns active `AIModel` rows for the model picker. |
| `runAIAnalysis(imageId: string, modelId?: string)` | Creates an `ai_analysis_jobs` row, runs inference (mock or real), writes detections, returns job summary. |
| `verifyDetection(detectionId: string, approved: boolean, notes?: string)` | Inspector verification of an AI detection. |
| `getDetectionsForImage(imageId: string)` | Returns detections + model metadata. |

### 5.3 React Query Hooks

Append to `src/app/lib/queries.ts`:

- `useAIModels()`
- `useAIDetections(imageId?: string)`
- `useAIAnalysisJobs(imageId?: string)`

Append to `src/app/lib/mutations.ts`:

- `useRunAIAnalysis()`
- `useVerifyDetection()`

### 5.4 UI Components

Create under `src/components/ai/`:

| Component | Responsibility |
| --- | --- |
| `AIAnalysisPanel` | Model picker, run-analysis button, progress/status, aggregate severity summary. |
| `DamageOverlay` | Renders normalized bounding boxes + severity color badges over an inspection image. |
| `DetectionList` | Editable list of detections; inspector can verify/delete/annotate each. |
| `SeverityBadge` | Color-coded chip: green (low), yellow (medium), red (high), purple (critical). |

Integrate `AIAnalysisPanel` into `src/app/(dashboard)/document/page.tsx`, below the asset feed or in a new tabbed section.

### 5.5 Severity Scoring Logic

The spec requires a `severity_score` from 0–100. Implement a deterministic mapping so the prototype is testable without a trained regressor:

```ts
function severityToScore(severity: SeverityLevel): number {
  switch (severity) {
    case 'low':    return 25
    case 'medium': return 50
    case 'high':   return 75
    case 'critical': return 95
  }
}
```

For real deployments, replace with a model head that outputs a continuous severity score based on damage dimensions and context.

---

## 6. AR Module — Data Model

### 6.1 New Tables

Append to the same migration `supabase/migrations/006_ai_module.sql` (or create `007_ar_module.sql`):

```sql
-- AR sessions created during an inspection
CREATE TABLE ar_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  started_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('active', 'paused', 'completed')) DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  device_info jsonb DEFAULT '{}'
);

-- Persistent AR anchors attached to physical structures
CREATE TABLE ar_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES ar_sessions(id) ON DELETE CASCADE,
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  detection_id uuid REFERENCES ai_damage_detections(id) ON DELETE SET NULL,
  label text NOT NULL,
  damage_type text CHECK (damage_type IN ('crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none')),
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  pose jsonb NOT NULL,              -- { position: {x,y,z}, quaternion: {x,y,z,w} }
  world_position jsonb,             -- optional GPS/UTM position
  notes text DEFAULT '',
  snapshot_path text,               -- optional camera snapshot in storage
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ar_sessions_inspection_id_idx ON ar_sessions(inspection_id);
CREATE INDEX ar_anchors_session_id_idx ON ar_anchors(session_id);
CREATE INDEX ar_anchors_inspection_id_idx ON ar_anchors(inspection_id);

ALTER TABLE ar_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_anchors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_sessions_select_all" ON ar_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ar_sessions_admin_all" ON ar_sessions FOR ALL TO authenticated USING (get_my_role() = 'admin');

CREATE POLICY "ar_anchors_select_all" ON ar_anchors FOR SELECT TO authenticated USING (true);
CREATE POLICY "ar_anchors_admin_all" ON ar_anchors FOR ALL TO authenticated USING (get_my_role() = 'admin');
```

### 6.2 TypeScript Types

Append to `src/app/types/index.ts`:

```ts
export type ARSessionStatus = 'active' | 'paused' | 'completed'

export interface Vector3 { x: number; y: number; z: number }
export interface Quaternion { x: number; y: number; z: number; w: number }

export interface ARPose {
  position: Vector3
  quaternion: Quaternion
}

export interface ARSession {
  id: string
  inspection_id: string
  started_by: string | null
  status: ARSessionStatus
  started_at: string
  ended_at: string | null
  device_info: Record<string, unknown>
}

export interface ARAnchor {
  id: string
  session_id: string
  inspection_id: string
  detection_id: string | null
  label: string
  damage_type: DamageType | null
  severity: SeverityLevel | null
  pose: ARPose
  world_position: Vector3 | null
  notes: string
  snapshot_path: string | null
  created_at: string
}
```

---

## 7. AR Module — Architecture

### 7.1 WebXR Flow

```text
1. Inspector opens inspection → clicks "AR Mode"
2. App requests an XR immersive-ar session
3. Camera feed is rendered as the background
4. User points device at wall/beam/column
5. Hit-test places a 3-D reticle on detected surfaces
6. Inspector taps to drop an anchor
7. AI inference (optional) classifies the anchor view → fills damage_type/severity
8. Anchor + snapshot persisted to ar_anchors
9. Later visits load anchors and re-overlay them
```

### 7.2 Components

Create under `src/components/ar/`:

| Component | Responsibility |
| --- | --- |
| `ARSessionManager` | Wraps WebXR `navigator.xr.requestSession('immersive-ar')`, handles session lifecycle, renders fallback UI on non-XR devices. |
| `ARCameraView` | Renders the camera background and hit-test reticle. |
| `AROverlay` | Renders HTML/3-D labels at anchor positions (`"crack detected"`, severity color). |
| `ARAnchorForm` | Form to label a newly placed anchor and link it to an AI detection. |
| `ARUnsupportedNotice` | Shown on desktop or devices without WebXR. |

### 7.3 New Route

Add `src/app/(dashboard)/ar/page.tsx` as the AR Inspection Mode entry point. Accept `?inspectionId=<id>` query parameter.

### 7.4 AR + AI Fusion

When an anchor is placed:

1. Capture a still frame from the XR session or the camera feed.
2. Run the AI classifier on that frame.
3. Auto-populate `damage_type`, `severity`, `confidence`, and optionally link to a persisted `ai_damage_detections` row.
4. Store the anchor pose relative to the session coordinate system.

---

## 8. Cross-Cutting Concerns

### 8.1 Final Damage Score

The spec defines a final weighted score. Implement a server-side helper:

```ts
function computeFinalScore(
  aiSeverityScore: number,        // 0–100
  structuralImportance: number,   // 1.0–3.0 multiplier
  exposureFactor: number,         // 0.5–2.0 multiplier
  locationRiskFactor: number      // 0.5–2.0 multiplier
): number {
  const normalized = aiSeverityScore / 100 * 10
  const weighted = normalized * structuralImportance * exposureFactor * locationRiskFactor
  return Math.min(10, Math.max(0, weighted))
}
```

Use this score to feed the existing `risk_score` and `risk_level` fields on `inspections` when an AI/AR inspection is saved.

### 8.2 Maintenance Prioritization

When an AI detection with severity `high` or `critical` is verified, optionally auto-create a `maintenance_priorities` row via the existing mutation in `src/app/lib/mutations.ts`.

### 8.3 Reports

Update `src/components/reports/report-form.tsx` and `print-report.tsx` to include:

- AI-detected damage summary.
- Severity distribution.
- AR anchor snapshot thumbnails (if available).

### 8.4 Dashboard

Extend `src/components/dashboard/damage-trend-chart.tsx` and `risk-hotspots.tsx` to consume `ai_damage_detections` counts in addition to existing manual risk hotspots.

---

## 9. Implementation Phases

Execute in this order. Each phase should leave the app in a buildable state.

### Phase 1 — Schema & Types (foundation)

1. Create `supabase/migrations/006_ai_module.sql` with `ai_models`, `ai_damage_detections`, `ai_analysis_jobs`.
2. Create `supabase/migrations/007_ar_module.sql` with `ar_sessions`, `ar_anchors`.
3. Append types to `src/app/types/index.ts`.
4. Run `npm run build` to confirm no TypeScript errors.

### Phase 2 — AI Backend

1. Create `src/app/actions/ai.ts` with model/detection/jobs actions.
2. Append hooks to `src/app/lib/queries.ts` and `src/app/lib/mutations.ts`.
3. Seed one mock AI model row (`format: 'mock'`) via a small SQL insert or a one-off script.
4. Test via `npm run build`.

### Phase 3 — AI Frontend

1. Create `src/components/ai/AIAnalysisPanel.tsx`, `DamageOverlay.tsx`, `DetectionList.tsx`, `SeverityBadge.tsx`.
2. Integrate panel into `src/app/(dashboard)/document/page.tsx`.
3. Add "Run AI Analysis" button to `AssetFeed` per image.
4. Test via `npm run build`.

### Phase 4 — AR Backend

1. Create `src/app/actions/ar.ts` for sessions/anchors.
2. Append `useAR...` hooks to queries/mutations.

### Phase 5 — AR Frontend

1. Create `src/components/ar/ARSessionManager.tsx`, `ARCameraView.tsx`, `AROverlay.tsx`, `ARAnchorForm.tsx`, `ARUnsupportedNotice.tsx`.
2. Create `src/app/(dashboard)/ar/page.tsx`.
3. Add "AR Mode" link in `src/components/shared/sidebar.tsx`.
4. Test via `npm run build`. WebXR itself can only be tested on an XR-capable mobile browser; desktop will show `ARUnsupportedNotice`.

### Phase 6 — Integration & Reports

1. Wire AI detections into reports (`report-form.tsx`, `print-report.tsx`).
2. Wire AR anchors into dashboard / risk hotspots.
3. Final `npm run build` and visual smoke test.

---

## 10. Known Caveats & Limitations

| Caveat | Impact | Mitigation |
| --- | --- | --- |
| **Trained model not included** | AI detections are either mock or low-confidence until a real model is trained and exported. | Ship mock model by default; document training pipeline for follow-up. |
| **WebXR instead of ARKit/ARCore** | Indoor SLAM quality depends on device/browser support; persistence across sessions is limited on the web. | Store anchor pose + snapshot; allow manual re-anchoring on revisit. |
| **Deformation data gap** | No open-source RGB deformation dataset; deformation detection is hard to automate from images alone. | Treat deformation as manual/NDT-derived label; future work uses 3-D point clouds. |
| **Dataset license heterogeneity** | Some datasets (CODEBRIM, DeepCrack) are non-commercial or academic-only. | Prefer CC BY 4.0 datasets (CiF, StructDamage, GYU-DET) for any public/commercial demo. |
| **High-resolution tiling complexity** | Browser-based tiling + ONNX inference can be slow on mobile. | Use SAHI only when needed; downsample to 1024 px patches; consider server-side inference for production. |
| **GPS accuracy indoors** | The spec notes indoor GPS is weak. | Use relative AR coordinates for indoor anchoring; GPS only as outdoor fallback. |
| **No Playwright testing** | UI regressions must be caught manually or with lightweight unit tests. | Verify build passes and perform manual browser checks on upload → AI → AR flow. |

---

## 11. Implementer-Agent Handoff Checklist

After completing the code changes above, the implementer agent must:

- [ ] Confirm `npm run build` succeeds with zero TypeScript/ESLint errors.
- [ ] Confirm `npm run lint` passes (or only flags pre-existing issues).
- [ ] Do **not** run Playwright tests.
- [ ] Stage all new and modified files.
- [ ] Create a feature branch (e.g., `git checkout -b feat/ai-ar-modules`).
- [ ] Commit with a message such as:
  ```
  feat(ai,ar): implement AI damage detection and AR inspection modules

  - Add ai_models, ai_damage_detections, ai_analysis_jobs tables
  - Add ar_sessions, ar_anchors tables
  - Add AI analysis panel, damage overlay, and detection list UI
  - Add WebXR-based AR inspection page and anchor components
  - Integrate AI results into reports and dashboard risk indicators
  - Document open-source datasets and caveats in plan

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```
- [ ] Push the branch to origin.
- [ ] Rebuild the handover archive from the project root:
  ```bash
  zip -r eprop-view-handover.zip . \
    -x "node_modules/*" ".next/*" ".git/*" "*.zip" "docs/*.bak" "docs/*.docx.bak" "docs/.~lock.*"
  ```
- [ ] Verify the rebuilt `eprop-view-handover.zip` exists in the project root.
- [ ] Leave the working tree on the feature branch with uncommitted changes only if explicitly instructed; otherwise commit and push.

---

## 12. Quick Reference — Files to Touch

| File | Change |
| --- | --- |
| `supabase/migrations/006_ai_module.sql` | New AI tables, indexes, RLS. |
| `supabase/migrations/007_ar_module.sql` | New AR tables, indexes, RLS. |
| `src/app/types/index.ts` | New AI/AR TypeScript interfaces. |
| `src/app/actions/ai.ts` | New server actions for AI models/detections/jobs. |
| `src/app/actions/ar.ts` | New server actions for AR sessions/anchors. |
| `src/app/lib/queries.ts` | New React Query hooks for AI/AR data. |
| `src/app/lib/mutations.ts` | New mutations for running analysis, verifying detections, creating anchors. |
| `src/components/ai/*` | AI analysis UI components. |
| `src/components/ar/*` | AR session/overlay UI components. |
| `src/app/(dashboard)/document/page.tsx` | Add AI analysis panel. |
| `src/app/(dashboard)/ar/page.tsx` | New AR mode page. |
| `src/components/shared/sidebar.tsx` | Add AR Mode navigation link. |
| `src/components/reports/report-form.tsx` | Include AI detection summary. |
| `src/components/reports/print-report.tsx` | Render AI/AR evidence in PDF layout. |
| `package.json` | Add `@tensorflow/tfjs`, `onnxruntime-web`, `three`, `@types/three` if used. |
| `next.config.ts` | Add any required CSP or external image domains. |
| `README.md` | Optional: update feature list to mention AI + AR modules. |
| `AI_AR_MODULE_IMPLEMENTATION_PLAN.md` | This plan (already in place). |

---

## 13. Notes for Future Production Work

- **Server-side inference:** Move heavy ONNX/TensorFlow inference to a Python microservice (FastAPI + ONNX Runtime GPU) behind a Supabase Edge Function or dedicated container to improve mobile battery life and support multi-megapixel SAHI tiling.
- **Real ARKit/ARCore:** For production mobile apps, wrap the web app in Capacitor or build native iOS/Android shells and bridge camera frames back to the shared TypeScript logic.
- **Model versioning:** Expand `ai_models` to track training dataset hash, mAP/F1 metrics, and A/B test flags.
- **Active learning:** Add a feedback loop from inspector verifications to retrain models monthly.

---

*End of plan.*
