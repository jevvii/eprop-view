# Workstream Briefs

**Rule:** workstreams never edit the same file. The contract layer (WS0) owns every
shared file — schema, types, server actions, RBAC, AI client. UI workstreams consume
that contract and touch only their own components and routes.

Each brief is written to be handed to an external agent (Antigravity) verbatim.

---

## WS0 — Contract layer · **owner: Claude** · branch `feat/capstone-v2-contract`

Lands **first**. Nothing else starts until this is merged into `staging`.

**Deliverables**

- Migrations `017`–`02x`, all idempotent and additive:
  - `ai_damage_detections`: crack width band, orientation, pattern, cause (ACI 224R / 201.1R)
  - `buildings` / `inspections`: tilt + differential settlement readings
  - `inspection_observations`: erosion condition
  - `rebound_tests` + `rebound_readings`
  - `soil_investigations`
  - `forensic_assessments` + evidence links
  - `checklist_templates` (versioned) + `checklist_responses`
  - `report_revisions`
  - `report_limitations`
  - `cost_estimates` (AI range + table value + confirmation state)
  - `recommendations` (draft → signed)
  - `audit_events`
  - `share_tokens` (report sharing)
- `src/app/types/index.ts` extended with every new enum and row type.
- Server actions for each new entity, each wrapping `requireCapability` and validating
  with a strict zod schema (`.strict()`, no `...updates` spreads).
- RLS policies for every new table, consistent with `get_my_role()`.
- `src/app/lib/ai/gemini.ts`: server-only client, zod schemas, quota counter,
  `3.8 Flash → 3.5 Flash-Lite → heuristic` fallback chain.
- Inspection update action with reopen semantics, writing `audit_events`.
- `audit_events` write helper wired into existing mutation actions.
- Fix `src/scripts/apply-all-migrations.ts`: auto-discover `supabase/migrations/*.sql`
  in sorted order instead of the hardcoded 002–015 list.
- `package.json`: add `"typecheck": "tsc --noEmit"`.
- `.github/workflows/ci.yml`: typecheck, lint, test, build.
- `.gitignore`: keep `.env*`, add `!.env.example`.
- Delete the `better-sqlite3` migration path and `src/app/lib/migrate.ts` if unused.

**Acceptance:** gate green, migrations re-run cleanly against Preview DB, `staging` updated.

---

## WS-A — Inspector capture · **owner: Antigravity** · branch `feat/inspector-capture`

**Depends on:** WS0 merged.

**Owns:** `src/components/inspections/*` (new), `src/app/(dashboard)/document/*`,
`src/components/reports/report-form.tsx` (limits section only).

**Deliverables**

1. Tilt / settlement panel — enter `tilt_mm_per_m` and `differential_settlement_mm`,
   show the computed classification with the threshold that produced it.
2. Rebound hammer form — add/remove readings, show mean after outlier rejection and the
   estimated MPa with the correlation named on screen.
3. Soil investigation form — borehole, depth, classification, SPT, groundwater,
   liquefaction susceptibility. Site/building level, not per inspection.
4. Erosion observation — condition field on the inspection, showing the project score it feeds.
5. Forensic assessment — hypothesis, mechanism narrative, evidence picker linking
   images and detections, conclusion, next step.
6. Checklist runner — renders a versioned template, prefilled from geospatial zone
   membership, each item confirm/override, saves responses with the template version.
7. Profile self-service — every authenticated role can edit name, phone, department.

**Not in scope:** schema changes, new tables, server actions beyond the WS0 contract.

---

## WS-B — Engineer review · **owner: Antigravity** · branch `feat/engineer-review`

**Depends on:** WS0 merged.

**Owns:** `src/components/reports/*`, `src/components/ai/*`, `src/app/(dashboard)/reports/*`.

**Deliverables**

1. Crack taxonomy UI — width band, orientation, pattern, cause on each detection,
   with the ACI reference shown.
2. Cost + action panel — AI low/likely/high range beside the table value, divergence
   banner when they disagree beyond threshold, engineer confirmation required to sign.
3. Recommendation panel — draft state, editing, sign-off, visual distinction between
   draft and signed, provenance.
4. Full report editing — every field, revision history list, diff between versions,
   reopen control for completed reports.
5. Assessment-limitation builder — standard exclusion checklist plus free text plus
   per-element notes; renders into the printed report.
6. Per-element damage rollup — aggregate detections by structural element.

**Not in scope:** schema, migrations, new server actions outside the contract.

---

## WS-C — Filters, export, map · **owner: Antigravity** · branch `feat/filters-export-map`

**Depends on:** WS0 merged.

**Owns:** `src/components/shared/*`, `src/components/dashboard/*`,
`src/components/reports/reports-table.tsx`, `src/app/(dashboard)/projects/*`.

**Deliverables**

1. Shared filter bar — URL-synced, server-side, applied to reports, document vault,
   maintenance and dashboard. Severity, damage type, crack category,
   building/floor/element, date range, status, verification state. Saved presets.
2. CSV export for reports, detections and maintenance.
3. Report share link — tokenised read-only route.
4. Mapbox heatmap layer toggle driven by hotspot severity and detection density.
5. Page-level guards for `/projects` and `/document`.

**Not in scope:** report printing CSS (WS-B owns it).

---

## WS-D — Admin surfaces · **owner: Antigravity** · branch `feat/admin-surfaces`

**Depends on:** WS0 merged.

**Owns:** `src/app/(dashboard)/settings/*`, `src/components/settings/*`.

**Deliverables**

1. Audit log page — filterable `audit_events` view: actor, action, entity, timestamp.
2. System health page — real counts, failed AI jobs, storage usage, rate-limit stats.
3. Backup / restore — export a project's records as JSON, import with validation and a
   dry-run preview. Clearly labelled as a record export, not an infrastructure backup.
4. Project CRUD — create, edit, archive. Replaces the seed-only gap.
5. AI model registry editor — list, activate/deactivate, edit metadata. Explicitly **not**
   a deployment pipeline.
6. Cost table + threshold configuration in System Settings.

**Not in scope:** any change to `ai_models` schema (WS0 owns it).

---

## Sequencing

```
WS0 (contract)  ──►  merge to staging
       │
       ├──► WS-A  ─┐
       ├──► WS-B  ─┤
       ├──► WS-C  ─┼──► review queue ──► merge to staging
       └──► WS-D  ─┘
```

WS-A through WS-D may run in parallel because their file sets do not overlap.
If a workstream needs a change outside its owned files, it stops and reports —
it does not edit the contract itself.
