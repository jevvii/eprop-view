# ePropView — Capstone v2 Scope Contract

**Status:** Agreed 2026-11-11. Binding for all work in this cycle.
**Supersedes:** the "remaining known limitations" section of `AI_AR_MODULE_FINAL_APPROVAL.md`
and the open items in `REMEDIATION_BACKLOG.md` where they conflict.

This document exists so that every workstream — human, Claude, or Antigravity — builds
against the same contract. If code and this document disagree, the document wins until
it is amended in a reviewed commit.

---

## 1. Non-negotiables

1. **`main` is production.** Nothing is pushed or merged to `main` without the owner's
   explicit go signal. `staging` is the integration and review branch.
2. **Capstone depth.** No model training, no GPU, no payments, no multi-tenancy, no
   production SLOs, no real model deployment. Numeric models are documented formulas.
   Gaps are stated in the README, never hidden.
3. **Honest provenance.** Any AI-derived result records how it was produced
   (`gemini`, `heuristic`, or `engineer`). The UI never presents a heuristic as ML.
4. **Additive database changes only.** No `DROP COLUMN`, no destructive rename. Every
   migration is idempotent and re-runnable.
5. **The verification gate is mandatory** (§7).

---

## 2. Agreed decisions

| Area | Decision |
|---|---|
| Branch flow | feature → `staging` (free) → `main` (owner's go signal only) |
| Preview target | GitHub integration; `productionBranch = main`; every other branch is a Preview |
| Preview database | separate Supabase project, `gbuwldihkmapzondxkto`, Preview-scoped env vars only |
| Preview seed | idempotent seed, runs only when `VERCEL_ENV=preview` and `SEED_DEMO_DATA=1` |
| Verification gate | `tsc --noEmit`, `eslint`, node tests, `next build`, preview deploy — enforced in CI |
| CI | GitHub Actions on every push and PR |
| Diagram | acceptance checklist; gaps closed with honest capstone equivalents |
| Old branches | deleted (all merged; `redesign-v2`'s lone commit only removed agent notes) |
| Delegation | contracts land first; UI surfaces are delegated; owner integrates into `staging` |
| Merge authority | owner, explicitly |

---

## 3. The eleven panelist additions

### Tier A — full UX and persistence

| # | Item | Acceptance criteria |
|---|---|---|
| A1 | **Tilt / sinking indicator** | Per-building-per-inspection `tilt_mm_per_m` and `differential_settlement_mm`, entered manually. Classified `none` / `monitor` / `action_required` against documented thresholds. Visible as a building banner, a dashboard tile, and a map flag. Never inferred from photos. |
| A2 | **Crack categories** | ACI 224R width bands + ACI 201.1R cause + orientation + pattern enums stored on each detection. Drives the filter, the severity weighting, and the report. |
| A3 | **Filters** | One shared, URL-synced, server-side filter bar on reports, document vault, maintenance, and dashboard. Dimensions: severity, damage type, crack category, building/floor/element, date range, status, verification state. Saved presets. |
| A4 | **Editable reports** | Every field editable. Each save snapshots the prior version into `report_revisions`. Completed reports stay locked until explicitly reopened by engineer or admin. |
| A5 | **Recommendation** | Gemini drafts from detections, severity and cost; the engineer edits and signs. Only the signed version prints or exports. Draft and signed states are visibly distinct. |
| A6 | **Severity → cost + action** | Gemini returns a low / likely / high PHP range with basis and confidence. A deterministic cost table computes alongside. Divergence beyond the configured threshold flags the record and blocks signing until the engineer confirms. Stored with provenance. |
| A7 | **Structural limitations** | Per report: checklist of standard exclusions plus free text, and an optional per-element note. Prints as an explicit assessment-limitation statement. |
| A8 | **Flood + geohazard checklists** | Code-defined versioned templates, prefilled from the site's actual `geospatial_zones` membership and fault-line proximity, then confirmed or overridden. Answers persisted with the template version. |

### Tier B — schema, capture form, display

| # | Item | Acceptance criteria |
|---|---|---|
| B1 | **Rebound hammer** | N readings per structural element, outlier rejection, mean, and estimated in-situ strength (MPa) via a documented correlation. Tester and timestamp recorded. |
| B2 | **Soil investigation** | Building/site level. Borehole ID, depth, soil classification, SPT N-value, groundwater depth, liquefaction susceptibility. |
| B3 | **Erosion** | Observed condition per inspection, feeding the existing project-level erosion risk score rather than replacing it. |
| B4 | **Forensic engineering** | Failure hypothesis enum, mechanism narrative, evidence chain linking images and detections, conclusion, recommended next step. |

### Tier C — AI-assisted

| # | Item | Acceptance criteria |
|---|---|---|
| C1 | **AI vision classification** | Gemini classifies damage on deliberate capture only. Falls back 3.8 Flash → 3.5 Flash-Lite → heuristic on `429`. |
| C2 | **AI narrative** | Report narrative and recommendation drafting. Always editable, always attributable. |

---

## 4. Use-case diagram gap closure

See `docs/usecase_parity_matrix.md` for the per-node status. The gap-closure work:

- **Missing** → build: heatmap layer, general audit log (`audit_events`), record
  export/import (backup equivalent), admin system health page, project CRUD,
  CSV export, report sharing link, inspection record editing.
- **Partial** → complete: inspector profile access (currently admin-only `/settings`),
  per-element damage view, system configuration surface, AI model registry editor.
- **Honest equivalents**: "Manage AI Models (Deploy/Update)" is a registry and
  selection editor — not a deployment pipeline. "Backup & Restore" is record
  export/import — not infrastructure snapshots. "System Monitoring & Alerts" is an
  admin health page reading real counts — not an APM.

---

## 5. Security work included

- Page-level capability guards on `/projects` and `/document` (currently nav-hiding + RLS only).
- Close the viewer direct-URL read path on `/document`.
- Remove the legacy `better-sqlite3` / `backend/db.sqlite3` migration path.
- Normalise `.gitignore`: keep `.env*`, add `!.env.example`.

---

## 6. AI policy

- **Where Gemini runs:** an explicit "Deep AI Analysis" action on a stored image, an AR
  snapshot capture, cost/action estimation, and narrative drafting. **Never** on live AR
  frames — those stay on the deterministic heuristic so scanning cannot stall or burn quota.
- **Key handling:** `GEMINI_API_KEY` server-side only. No `NEXT_PUBLIC_` prefix. Route
  handlers and server actions only.
- **Quota:** per-user rate limit plus a daily counter. Free tier is roughly 20 requests/day
  on `gemini-3.8-flash`; degrade to `gemini-3.5-flash-lite`, then to the heuristic.
- **Validation:** every model response is parsed against a zod schema. A malformed
  response is a failed call, not a partial write.
- **Data notice:** free-tier inputs may be reviewed by Google and used to improve products.
  A visible notice is shown anywhere an image is submitted. Real client imagery is out of scope.
- **Provenance:** written to `ai_damage_detections.provenance` and surfaced in the UI.

---

## 7. Verification gate

A change is not "done" until all of these pass:

```bash
npx tsc --noEmit
npm run lint
npm test
npm run build
```

…plus a working Vercel Preview deployment of the branch, plus migrations applied and
verified against the Preview database. CI enforces the first four on every push.

---

## 8. Explicitly out of scope

- Real ML training or a trained checkpoint.
- Native ARCore/ARKit camera rendering.
- iOS build verification (no macOS available).
- Multi-tenancy, billing, SSO, production monitoring/APM.
- Rotating the leaked production credentials (owner action, tracked separately).
- Rewriting git history to purge seeded passwords.
