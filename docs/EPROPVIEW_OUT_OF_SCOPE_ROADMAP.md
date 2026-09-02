# EPROPVIEW Out-of-Scope Implementation Roadmap

## Document Control
| Field | Value |
| --- | --- |
| Project | EPROPVIEW |
| Derived from | `docs/EPROPVIEW_RBAC_AI_AR_FIX_SPEC.md` |
| Scope | Features intentionally excluded from the RBAC/AI/AR hardening fix phase |
| Author | Claude Code |
| Date | 2026-09-02 |
| Status | Roadmap / Backlog |

---

## 1. Introduction

The primary hardening phase (`EPROPVIEW_RBAC_AI_AR_FIX_SPEC.md`) focuses on bringing the application into compliance with `docs/user_access_definition.md` for RBAC, server-action security, RLS policy alignment, and UI gating. Several larger capabilities were deliberately excluded because they require dedicated design, external services, native mobile work, or trained ML artifacts.

This document provides a separate, implementable roadmap for those out-of-scope items so they can be planned, estimated, and executed in later phases without revisiting the hardening spec.

---

## 2. Out-of-Scope Items Summary

| # | Feature | Why Out of Scope in Hardening Phase |
| --- | --- | --- |
| 1 | Real AI model inference (ONNX / TensorFlow.js / PyTorch) | Requires model artifacts, training data, preprocessing pipeline, and performance testing |
| 2 | Native iOS ARKit / Android ARCore integration | Requires Capacitor / React Native / native bridge; outside web-only hardening |
| 3 | Building / floor / structural-element master-data CRUD | Needs admin UI, import flows, and hierarchy validation |
| 4 | Geohazard shapefile / GeoJSON upload and layer management | Requires file parsing, PostGIS import, and admin UI |
| 5 | Storage bucket lifecycle / S3 management UI | Cloud-ops feature requiring provider-specific APIs |

Each item is expanded below into an independent implementation phase.

---

## 3. Phase A: Real-Time AI Damage Detection

### 3.1 Goal
Replace deterministic mock inference with a production-ready computer-vision pipeline that runs structural damage detection in the browser or on a backend worker, depending on model size and latency requirements.

### 3.2 Supported Damage Types
- Crack
- Corrosion
- Spalling
- Deformation
- Leakage
- None / background

### 3.3 Model Architecture Options

#### Option A — ONNX Runtime Web (Recommended for browser)
- Export trained YOLOv8 / EfficientDet / RT-DETR to ONNX.
- Serve model weights from Supabase Storage or a CDN.
- Run inference in a Web Worker to avoid blocking the UI thread.
- Post-process bounding boxes and NMS in the worker.

#### Option B — TensorFlow.js (Browser)
- Convert a trained TensorFlow / Keras model to TFJS graph model.
- Use `tf.image.resizeBilinear` for preprocessing.
- Suitable for classification-only or small detection models.

#### Option C — Backend API (Server-side inference)
- Deploy a Python FastAPI service with PyTorch / ONNX Runtime.
- Upload image → backend returns detections.
- Better for heavy models, but adds infrastructure and latency.

### 3.4 Required Components

#### 3.4.1 Model registry enhancements
**File:** `supabase/migrations/010_ai_model_registry_v2.sql`

Extend `ai_models` table:

```sql
ALTER TABLE public.ai_models
ADD COLUMN architecture text DEFAULT 'yolov8',
ADD COLUMN input_width int DEFAULT 640,
ADD COLUMN input_height int DEFAULT 640,
ADD COLUMN confidence_threshold float DEFAULT 0.25,
ADD COLUMN iou_threshold float DEFAULT 0.45,
ADD COLUMN preprocessing jsonb DEFAULT '{}',
ADD COLUMN metadata jsonb DEFAULT '{}';
```

#### 3.4.2 Inference worker
**New file:** `src/app/lib/ai/inference-worker.ts`

```ts
// src/app/lib/ai/inference-worker.ts
export async function runDetection(imageBlob: Blob, model: AIModel): Promise<AIDamageDetection[]> {
  // 1. Load ONNX model if not cached
  // 2. Decode image to ImageBitmap / tensor
  // 3. Resize + normalize to model input dims
  // 4. Run inference session
  // 5. Apply NMS
  // 6. Map outputs to AIDamageDetection rows
}
```

#### 3.4.3 Preprocessing pipeline
**New file:** `src/app/lib/ai/preprocessing.ts`

- EXIF orientation correction.
- Resize to model input size (letterbox padding to preserve aspect ratio).
- Normalize pixel values (e.g., divide by 255).
- Optional: contrast enhancement for concrete crack visibility.

#### 3.4.4 Severity scoring model
- Train or configure a second head / separate classification model to map detected region features to severity score (0-100).
- Alternatively, use rule-based severity from bounding-box area, damage type, and location context.

### 3.5 Data Requirements
- Annotated dataset: ~1,000–10,000 labeled images per damage type.
- Bounding boxes in COCO or YOLO format.
- Validation split and benchmark metrics (mAP@50, mAP@50-95).
- Data augmentation: rotation, brightness, noise, blur.

### 3.6 UI Changes
- `src/components/ai/ai-analysis-panel.tsx`: show progress bar, inference time, model info.
- `src/components/ai/damage-overlay.tsx`: render real bounding boxes returned by model.
- `src/components/ar/ar-anchor-form.tsx`: run inference on camera frame when user taps "Scan with AI".

### 3.7 Acceptance Criteria
- [ ] Real model inference runs end-to-end on a sample inspection image.
- [ ] Detections are persisted to `ai_damage_detections` with bbox, confidence, severity_score.
- [ ] Inference completes in < 3 seconds per image on a mid-range laptop.
- [ ] Preprocessing handles EXIF orientation and preserves aspect ratio.
- [ ] Model registry supports versioned weights and active/standby toggling.
- [ ] Inspector can trigger analysis; engineer can review real results.

### 3.8 Risks
| Risk | Mitigation |
| --- | --- |
| Model size too large for browser | Use backend API or quantize to INT8 |
| Training data unavailable | Start with public structural-damage datasets + synthetic augmentation |
| Cross-browser WebGL/ONNX issues | Test on Chrome, Edge, Safari; fallback to backend |

---

## 4. Phase B: Native ARKit / ARCore Integration

### 4.1 Goal
Provide true immersive AR on iOS and Android by wrapping the web app in a native container (Capacitor or React Native) that exposes native ARKit/ARCore tracking and scene understanding to the webview.

### 4.2 Why WebXR Is Insufficient
- iOS Safari does not support WebXR immersive AR.
- Android WebXR depends on ARCore-enabled Chrome and device support is inconsistent.
- WebXR hit-test provides plane detection but limited persistence and no native SLAM map sharing.

### 4.3 Architecture Options

#### Option A — Capacitor Plugin (Recommended)
- Build a custom Capacitor plugin `capacitor-ar-bridge`.
- Plugin starts an ARKit/ARCore session from the native side.
- Sends camera pose, hit-test results, and anchors to the webview via JavaScript bridge.
- Webview renders UI overlays; native view shows camera feed.

#### Option B — React Native with WebView + AR
- Use `@virocommunity/react-viro` or `react-native-ar-kit`.
- Embed the existing Next.js app in a WebView.
- Bridge AR events from React Native to WebView.

### 4.4 Native Responsibilities
- Camera permission handling.
- AR session lifecycle (start / pause / stop).
- Plane / surface detection.
- Anchor creation and persistence in native ARAnchor store.
- Snapshot capture with damage overlay.
- GPS + ARKit/ARCore world alignment (for outdoor large structures).

### 4.5 Web App Responsibilities
- Render forms and telemetry UI.
- Receive pose / anchor events from native bridge.
- Send anchor metadata (label, damage_type, severity, notes) to Supabase.
- Display persisted anchors from Supabase on the native AR view when revisiting a site.

### 4.6 Required Components

#### 4.6.1 Capacitor project
**New directory:** `native/`

```
native/
├── capacitor.config.ts
├── android/
├── ios/
└── plugins/
    └── capacitor-ar-bridge/
        ├── android/
        │   └── ARBridgePlugin.java
        └── ios/
            └── ARBridgePlugin.swift
```

#### 4.6.2 JavaScript bridge types
**New file:** `src/types/ar-bridge.ts`

```ts
export interface ARBridgeEvent {
  type: 'planeDetected' | 'anchorPlaced' | 'anchorUpdated' | 'sessionEnded' | 'error'
  payload: Record<string, unknown>
}

export interface NativeARAnchor {
  nativeId: string
  position: Vector3
  quaternion: Quaternion
  damageType?: DamageType
  severity?: SeverityLevel
  label?: string
}
```

#### 4.6.3 Bridge hook
**New file:** `src/app/lib/ar/native-bridge.ts`

```ts
export async function startNativeARSession(inspectionId: string): Promise<void>
export async function placeNativeAnchor(pose: ARPose, metadata: object): Promise<string>
export async function stopNativeARSession(): Promise<void>
export function onARBridgeEvent(callback: (event: ARBridgeEvent) => void): () => void
```

### 4.7 UI Changes
- `src/app/(dashboard)/ar/page.tsx`: detect Capacitor environment; use native bridge instead of WebXR when available.
- `src/components/ar/ar-camera-view.tsx`: render placeholder UI when native camera view is active.
- `src/components/ar/ar-overlay.tsx`: optionally render SVG overlays for anchors when in native mode.

### 4.8 Acceptance Criteria
- [ ] iOS app starts ARKit session and surfaces plane detection events.
- [ ] Android app starts ARCore session and surfaces plane detection events.
- [ ] User can place an anchor and it persists to `ar_anchors`.
- [ ] Reopening an inspection reloads persisted anchors into the native AR view.
- [ ] Snapshot capture includes the native camera frame.
- [ ] Inspector role is required to open AR mode.

### 4.9 Risks
| Risk | Mitigation |
| --- | --- |
| iOS App Store review for AR app | Provide clear value description and privacy policy |
| Native plugin maintenance | Keep plugin minimal; document build steps |
| Webview ↔ native performance | Throttle events to 30 Hz; batch anchor updates |

---

## 5. Phase C: Building / Floor / Structural Element Master Data

### 5.1 Goal
Allow admins to create and manage the building hierarchy used during inspections.

### 5.2 Data Model

**New migration:** `supabase/migrations/011_building_master_data.sql`

```sql
CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  description text DEFAULT '',
  latitude float,
  longitude float,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name text NOT NULL,
  level int,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE structural_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  element_type text NOT NULL CHECK (element_type IN ('beam','column','slab','wall','foundation','facade','roof','general','other')),
  identifier text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX buildings_project_id_idx ON buildings(project_id);
CREATE INDEX floors_building_id_idx ON floors(building_id);
CREATE INDEX structural_elements_floor_id_idx ON structural_elements(floor_id);

ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE structural_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "buildings_select_all" ON buildings FOR SELECT TO authenticated USING (true);
CREATE POLICY "buildings_admin_all" ON buildings FOR ALL TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY "floors_select_all" ON floors FOR SELECT TO authenticated USING (true);
CREATE POLICY "floors_admin_all" ON floors FOR ALL TO authenticated USING (get_my_role() = 'admin');
CREATE POLICY "structural_elements_select_all" ON structural_elements FOR SELECT TO authenticated USING (true);
CREATE POLICY "structural_elements_admin_all" ON structural_elements FOR ALL TO authenticated USING (get_my_role() = 'admin');
```

Update `inspections` table:

```sql
ALTER TABLE public.inspections
ADD COLUMN building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
ADD COLUMN floor_id uuid REFERENCES floors(id) ON DELETE SET NULL,
ADD COLUMN structural_element_id uuid REFERENCES structural_elements(id) ON DELETE SET NULL;
```

### 5.3 Admin UI

#### 5.3.1 Buildings manager
**New file:** `src/components/settings/buildings-manager.tsx`

- List buildings per project.
- Add / edit / delete building (name, code, coordinates).

#### 5.3.2 Floor manager
**New file:** `src/components/settings/floor-manager.tsx`

- Nested under selected building.
- Add floor with name and level.
- Drag-to-sort floors.

#### 5.3.3 Structural element manager
**New file:** `src/components/settings/structural-element-manager.tsx`

- Select floor.
- Add element by type and identifier (e.g., "Column C-14").
- Bulk import from CSV.

### 5.4 Inspection Form Updates
**File:** `src/components/document/inspection-form.tsx`

Replace free-text floor and structural element inputs with cascading selects:
1. Select Project.
2. Select Building (filtered by project).
3. Select Floor (filtered by building).
4. Select Structural Element (filtered by floor).

### 5.5 Server Actions
**New file:** `src/app/actions/buildings.ts`

- `createBuilding`, `updateBuilding`, `deleteBuilding`
- `createFloor`, `updateFloor`, `deleteFloor`, `reorderFloors`
- `createStructuralElement`, `updateStructuralElement`, `deleteStructuralElement`
- All require admin role.

### 5.6 Acceptance Criteria
- [ ] Admin can CRUD buildings, floors, and structural elements.
- [ ] Inspector selects from cascading dropdowns instead of free text.
- [ ] Inspection records reference the master data via foreign keys.
- [ ] Deleting a building cascades to related floors and elements.
- [ ] Reports show structured building/floor/element labels.

### 5.7 Risks
| Risk | Mitigation |
| --- | --- |
| Existing inspections have free-text values | Migration to normalize data or keep legacy fields as fallback |
| CSV import errors | Validate and return row-level error messages |

---

## 6. Phase D: Geohazard Layer Management

### 6.1 Goal
Allow admins to upload geohazard datasets (fault lines, flood zones, liquefaction zones, erosion areas) as GeoJSON / shapefiles and visualize them on the map.

### 6.2 Supported Layer Types
- Fault line proximity (LineString / MultiLineString)
- Flood zone (Polygon / MultiPolygon)
- Soil liquefaction zone (Polygon)
- Erosion risk zone (Polygon)
- General hazard boundary (Polygon)

### 6.3 Data Model

`geospatial_zones` already exists. Enhance it:

```sql
ALTER TABLE public.geospatial_zones
ADD COLUMN source_file text,
ADD COLUMN source_format text CHECK (source_format IN ('geojson','shapefile','kml','manual')),
ADD COLUMN effective_date date,
ADD COLUMN expiry_date date,
ADD COLUMN is_active boolean DEFAULT true;
```

### 6.4 Upload Pipeline

#### 6.4.1 GeoJSON importer
**New file:** `src/app/lib/geo/import-geojson.ts`

- Parse FeatureCollection.
- Validate geometries are Polygon/MultiPolygon/LineString.
- Reproject to EPSG:4326 if CRS is present.
- Convert GeoJSON geometry to WKT for PostGIS insertion.

#### 6.4.2 Shapefile importer
**New file:** `src/app/lib/geo/import-shapefile.ts`

- Use `shapefile` npm package or server-side Python script.
- Extract `.shp`, `.dbf`, `.prj` from uploaded zip.
- Map shapefile attributes to zone metadata.

#### 6.4.3 Server action
**New file:** `src/app/actions/geohazard.ts`

```ts
export async function importGeohazardLayer(formData: FormData)
```

- Requires admin.
- Accepts file upload.
- Parses file based on extension.
- Inserts or updates `geospatial_zones` rows.

### 6.5 Admin UI
**New file:** `src/components/settings/geohazard-layer-manager.tsx`

- Upload GeoJSON/shapefile per project.
- List layers with type, risk level, active status.
- Toggle visibility / delete layer.
- Preview uploaded geometry on a small Mapbox map.

### 6.6 Map Visualization
**File:** `src/components/dashboard/geospatial-map.tsx`, `src/components/environmental/env-map.tsx`

- Render `geospatial_zones` as Mapbox layers.
- Color-code by `zone_type` and `risk_level`.
- Show/hide layers via toggle controls.

### 6.7 Environmental Risk Automation
**File:** `src/app/lib/environmental/scoring.ts` (new)

```ts
export async function computeProjectEnvironmentalRisk(projectId: string): Promise<number>
```

- Query geospatial zones overlapping project coordinates.
- Calculate weighted score from fault proximity, liquefaction, flood, erosion.
- Propose updates to `environmental_risks.overall_risk_score`.

### 6.8 Acceptance Criteria
- [ ] Admin uploads a GeoJSON file and zones appear on the map.
- [ ] Shapefile upload works for multi-file zips.
- [ ] Map renders hazard layers with correct colors.
- [ ] Environmental risk score can be auto-computed from overlapping zones.
- [ ] Engineers can view layers but cannot upload or edit them.

### 6.9 Risks
| Risk | Mitigation |
| --- | --- |
| Large shapefiles time out | Stream upload or process server-side in background |
| CRS mismatches | Detect `.prj` and reproject before insert |
| Duplicate zones | Add upsert by (project_id, name, zone_type) |

---

## 7. Phase E: Storage Bucket Lifecycle / S3 Management

### 7.1 Goal
Provide admins with visibility and control over object storage used for inspection images, model weights, and report archives.

### 7.2 Supported Backends
- Supabase Storage (primary)
- Storj DCS S3-compatible archive
- Optional: AWS S3 / R2

### 7.3 Required Data

#### 7.3.1 Storage usage table
**New migration:** `supabase/migrations/012_storage_audit.sql`

```sql
CREATE TABLE storage_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  size_bytes bigint,
  owner_id uuid,
  project_id uuid,
  inspection_id uuid,
  uploaded_at timestamptz,
  last_accessed_at timestamptz,
  storage_class text DEFAULT 'standard'
);

CREATE INDEX storage_audit_bucket_idx ON storage_audit(bucket_id);
CREATE INDEX storage_audit_project_idx ON storage_audit(project_id);
```

Populate via Supabase Storage webhook or periodic sync.

### 7.4 Admin UI
**New file:** `src/components/settings/storage-manager.tsx`

Display:
- Total storage per bucket.
- Storage per project / inspection.
- Oldest objects.
- Orphaned objects (in storage but no DB row).

Actions:
- Delete selected objects.
- Move objects to archive/cold storage class.
- Trigger manual sync of storage audit table.

### 7.5 Server Actions
**New file:** `src/app/actions/storage.ts`

```ts
export async function getStorageSummary(): Promise<StorageSummary>
export async function deleteStorageObject(bucket: string, path: string): Promise<void>
export async function syncStorageAudit(): Promise<{ synced: number }>
```

All require admin.

### 7.6 Lifecycle Policies
- Automatically move inspection images older than 1 year to Storj archive bucket.
- Delete soft-deleted images after retention period.
- Enforce 7-year retention for compliance reports.

### 7.7 Acceptance Criteria
- [ ] Admin sees per-project storage usage.
- [ ] Admin can delete or archive selected objects.
- [ ] Audit table stays in sync with storage bucket.
- [ ] Lifecycle rules run via scheduled Supabase Edge Function or cron.

### 7.8 Risks
| Risk | Mitigation |
| --- | --- |
| Service role key exposure | Restrict storage actions to server actions only |
| Accidental deletion | Add confirmation and soft-delete pattern |
| Cross-provider API differences | Abstract provider behind storage adapter interface |

---

## 8. Cross-Cutting Concerns

### 8.1 RBAC for Out-of-Scope Phases
Every new admin UI and server action introduced in these phases must enforce the same RBAC pattern used in the hardening phase:
- Use `requireRole(['admin'])` for building/geohazard/storage management.
- Use `requireRole(['engineer','admin'])` for risk-score automation triggers.
- Use `requireRole(['inspector','admin'])` for native AR capture.

### 8.2 Testing
- Add a dedicated test file per phase.
- Validate file uploads, native bridge events, and model inference outputs with mocked dependencies.
- Maintain the seeded-account smoke-test checklist from the hardening spec.

### 8.3 Documentation Updates
After each phase, update:
- `docs/sys_module_description.md`
- `docs/user_operations_guide.md`
- `README.md` architecture and feature sections

### 8.4 Performance Budgets
- AI inference: < 3 seconds per image.
- AR native bridge event latency: < 50 ms round trip.
- GeoJSON upload parsing: < 30 seconds for 50 MB file.
- Storage audit sync: < 5 minutes for 100,000 objects.

---

## 9. Recommended Phase Order

1. **Phase A — Real AI Detection** first, because it unblocks meaningful AR fusion and report generation.
2. **Phase C — Building Master Data** next, because it improves data quality and reporting.
3. **Phase D — Geohazard Layers** after building data is stable.
4. **Phase E — Storage Management** when storage volume justifies operational tooling.
5. **Phase B — Native AR** last or in parallel with mobile app release planning, because it requires the most platform-specific work.

---

## 10. Summary

The out-of-scope items from the RBAC/AI/AR hardening spec represent the path from a functional prototype to a production-grade structural-health platform. Each phase is self-contained, has clear acceptance criteria, and can be staffed and estimated independently. They should be tracked in the project backlog and prioritized based on user needs, available training data, and mobile deployment strategy.
