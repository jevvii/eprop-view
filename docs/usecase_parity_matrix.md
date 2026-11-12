# Use Case Parity Matrix

**Purpose:** the agreed use-case diagram is the acceptance checklist for this cycle.
**Legend:** `MET` = implemented and reachable · `PARTIAL` = exists but incomplete ·
`MISSING` = not implemented · `EQUIV` = capstone equivalent, deliberately not 1:1.

Baseline captured 2026-11-11 against commit `14b6d9c`. Update the status column as work lands.

---

## Inspector

| Use case | Current | Route / action | Target |
|---|---|---|---|
| Login / Logout | `MET` | `src/app/page.tsx`, `actions/auth.ts` | — |
| Manage Profile | `MISSING` | `/settings` is admin-only | Allow self-service profile for all authenticated users |
| Create Inspection Record | `MET` | `actions/inspections.ts`, `/document` | Add edit (see below) |
| Select Building / Floor / Element | `MET` | `buildings` tables, inspection form | — |
| Capture AR Scan | `MET` | `/ar`, `ar-session-manager.tsx` | — |
| Upload Image | `MET` | `actions/uploads.ts` | — |
| Add Location (GPS / Map Pin) | `PARTIAL` | `inspections.location` text | Capture coordinates explicitly |
| Confirm Notes (Optional) | `MET` | `inspections.notes` | — |
| Submit Inspection | `MET` | `createInspection` | — |
| AI Damage Detection (Real-time) | `MET` | `lib/ai/inference-worker.ts` (heuristic) | Gemini on deliberate capture |
| View AI Results (AR overlay) | `MET` | `detection-list.tsx`, `damage-overlay.tsx` | — |
| Confirm / Edit Detection | `MET` | `verifyDetection`, `updateAIDetection` | Add crack taxonomy fields |
| Save AR Anchor and Location | `MET` | `ar_anchors` | — |
| Submit Inspection (pipeline) | `MET` | — | — |
| View on Map (My Records) | `PARTIAL` | dashboard map | Per-inspector filter, heatmap |
| Attach Notes (Optional) | `MET` | `image_comments` | — |
| **Edit submitted inspection** | `MISSING` | no update action exists | Add with reopen + audit |

## Engineer

| Use case | Current | Route / action | Target |
|---|---|---|---|
| Login / Logout | `MET` | — | — |
| View Inspections | `MET` | `/document`, `/projects` | Add page guards |
| Review AI Results & Evidence | `MET` | `/document` | Show provenance + confidence source |
| Validate / Adjust Results | `MET` | verify / update detection | — |
| Assess Geohazard Risk | `MET` | `/environmental`, `lib/environmental/scoring.ts` | Add checklists |
| Analyze Damage Score | `MET` | `lib/damage-score.ts` | Include crack category |
| Add Engineer Notes | `MET` | report + detection notes | — |
| Generate / Export Reports | `PARTIAL` | print only | CSV export + share link |
| Damage Scoring (Calculated) | `MET` | — | — |
| Maintenance Prioritization | `MET` | `maintenance-table.tsx` | Add filters |
| View Map & Heatmaps | `MISSING` | no heatmap layer | Add Mapbox heatmap |
| View Dashboard | `MET` | `get_dashboard_stats` RPC | Add tilt tile |
| Generate / Export Reports (pipeline) | `PARTIAL` | print only | CSV + share |
| View Damage Details (Per Element) | `PARTIAL` | per detection only | Per-element rollup |
| Assign Maintenance Tasks | `MET` | `maintenance_priorities.assigned_to` | — |
| Filter by Severity / Type / Location | `MISSING` | reports filter project + status only | Shared filter bar |
| Export / Download Reports | `PARTIAL` | `window.print()` | CSV + share |
| Share / Submit Reports | `MISSING` | — | Tokenised read-only share link |

## Admin

| Use case | Current | Route / action | Target |
|---|---|---|---|
| Login / Logout | `MET` | — | — |
| User Management (Roles & Access) | `MET` | `actions/admin.ts`, `/settings` | — |
| Manage Buildings & Structural Data | `MET` | `/settings` buildings tab | — |
| Manage Geohazard Data | `MET` | `actions/geohazard.ts`, import libs | Add flood checklist template |
| System Configuration & Settings | `PARTIAL` | `/settings` | Add cost table + thresholds |
| Storage & Data Management | `MET` | `actions/storage.ts` | — |
| System Monitoring & Logs | `MISSING` | — | Admin health page |
| Data Management (Records, Images, Anchors, AI Results) | `PARTIAL` | per-surface actions | Unified admin data view |
| Reports & Audit Logs | `PARTIAL` | report audit columns only | `audit_events` table + page |
| Backup & Restore | `MISSING` | — | JSON record export/import (`EQUIV`) |
| System Health & Maintenance | `MISSING` | — | Health page (`EQUIV`) |
| Manage AI Models (Deploy / Update) | `PARTIAL` | `ai_models` table only | Registry editor (`EQUIV`, no deployment) |
| Storage Management (Cloud / S3) | `MET` | storage manager | — |
| Data Retention & Archiving Policy | `MET` | storage classes, 7-year counters | — |
| System Monitoring & Alerts | `MISSING` | — | Health page (`EQUIV`) |
| **Project create / edit / archive** | `MISSING` | `projects` is seed-only | Admin CRUD |

---

## Summary at baseline

| Status | Count |
|---|---|
| `MET` | 31 |
| `PARTIAL` | 10 |
| `MISSING` | 10 |
| **Total nodes** | **51** |

Every `MISSING` and `PARTIAL` row above appears in exactly one workstream in
`docs/workstream_briefs.md`. Nothing in this matrix is orphaned.
