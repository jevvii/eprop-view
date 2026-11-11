# Handoff to Antigravity — four UI workstreams

**Repo:** `git@github.com:jevvii/eprop-view.git`
**Integration branch:** `staging` (contains the contract layer, commit `0bb3a1d`)
**Production:** `main` — never push or merge to it
**Preview:** every branch push gets an automatic Vercel Preview against an isolated Supabase database

---

## How to run the handoff

1. Install dependencies once per worktree:

   ```bash
   cd /home/javvii/FreelanceProject/Project5/worktrees/ws-a && npm ci
   ```

2. Open one Antigravity workspace per worktree. Four worktrees already exist and are on their own branches:

   | Workspace | Branch |
   |---|---|
   | `worktrees/ws-a` | `feat/inspector-capture` |
   | `worktrees/ws-b` | `feat/engineer-review` |
   | `worktrees/ws-c` | `feat/filters-export-map` |
   | `worktrees/ws-d` | `feat/admin-surfaces` |

3. Give each workspace its prompt from below verbatim. Do **not** give one agent two workstreams — the file sets are disjoint precisely so they can run in parallel without collisions.

4. When an agent finishes, it runs the gate and pushes. Review the diff, then merge that branch into `staging`. Nothing merges itself.

---

## Hard rules for every agent

Paste this at the top of every prompt if the workspace does not already have it:

> **Constraints — non-negotiable**
>
> - Do not edit `supabase/migrations/*`, `src/app/types/index.ts`, `src/app/lib/dal.ts`, `src/app/lib/role-utils.ts`, or any file under `src/app/actions/`. Those are the contract. If you need a change there, stop and report it.
> - Do not add npm dependencies without saying why in your final message.
> - Do not push to `main`. Do not merge anything.
> - Do not invent data. Empty states must say what will appear there and how to add the first item.
> - Every list you render must handle zero rows without crashing.
> - Run before you finish: `npm run typecheck && npm run lint && npm test && npm run build`.
> - Commit in small, descriptive commits. Push the branch when done.

---

## Available server actions

Agents must call these rather than writing new queries where one exists. All are in `src/app/actions/`.

**`structural.ts`**

```
recordSettlementObservation({ buildingId, inspectionId?, tiltMmPerM?, differentialSettlementMm?, measurementMethod, notes })
getSettlementObservations(buildingId)
updateDetectionCrackTaxonomy({ detectionId, widthMm?, orientation?, pattern?, cause?, exposure })
createReboundTest({ inspectionId, structuralElementId?, testDate?, impactDirection, instrumentSerial?, readings: number[], notes })
getReboundTestsForInspection(inspectionId)
createSoilInvestigation({ projectId?, buildingId?, boreholeId, depthM?, soilClassification?, sptNValue?, groundwaterDepthM?, liquefactionSusceptibility, investigationDate?, source, notes })
getSoilInvestigations({ projectId | buildingId })
updateInspectionRecord({ inspectionId, ...fields, reopen? })
createForensicAssessment({ inspectionId, reportId?, failureHypothesis, mechanismNarrative?, conclusion?, recommendedNextStep? })
addForensicEvidence({ assessmentId, imageId?, detectionId?, note? })
getForensicAssessments(inspectionId)
getChecklistTemplates()
saveChecklistResponse({ inspectionId, templateCode, responses })
getChecklistResponses(inspectionId)
```

**`reports-v2.ts`**

```
updateReportWithRevision({ reportId, title?, date?, location?, status?, riskScore?, keyFindings? })
getReportRevisions(reportId)
upsertReportLimitation({ reportId, standardExclusions, freeText?, elementNotes? })
getReportLimitation(reportId)
saveCostEstimate({ inspectionId?, detectionId?, reportId?, damageType, severity, elementType, aiLowPhp?, aiLikelyPhp?, aiHighPhp?, aiBasis?, aiConfidence? })
confirmCostEstimate(costEstimateId, reason)
getCostEstimates({ reportId | inspectionId })
summarizeCostEstimate(costEstimateId)
createRecommendation({ inspectionId?, reportId?, detectionId?, draftText?, provenance })
signRecommendation({ recommendationId, finalText })
getRecommendations({ reportId | inspectionId })
createShareToken(reportId, expiresInDays)
revokeShareToken(shareTokenId)
getAuditEvents({ entityType?, action?, limit? })
```

**`gemini-analysis.ts`**

```
getGeminiAvailability()
analyzeImageWithGemini(imageId)
suggestRepairCost({ damageType, severity, elementType, context })
draftRecommendation({ damageType, severity, elementType, context })
draftReportNarrative({ title, riskScore, riskLevel, findings, detections })
```

**Domain constants and helpers**

```
@/app/lib/structural/crack-taxonomy   → classifyCrackWidth, assessCrack, CRACK_WIDTH_BANDS, CAUSE_LABELS, ORIENTATION_LABELS, PATTERN_LABELS, EXPOSURE_LABELS, ACI_224R_EXPOSURE_LIMITS_MM
@/app/lib/structural/cost-table        → tableEstimate, tableRange, checkDivergence, formatPhp, COST_TABLE_VERSION
@/app/lib/structural/settlement        → classifySettlement, explainSettlement, SETTLEMENT_LABELS, TILT_THRESHOLDS_MM_PER_M, DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM
@/app/lib/structural/rebound           → summarizeReadings, REBOUND_CORRELATION_REFERENCE
@/app/lib/ai/gemini                    → GEMINI_DATA_NOTICE, isGeminiConfigured
```

All types are in `src/app/types/index.ts`.

---

# Prompt — WS-A · Inspector capture

```
You are working in a Next.js 16 / React 19 / Tailwind v4 codebase for ePropView, a
structural inspection system. Read these first, in order:

  docs/capstone_v2_scope_contract.md   (the binding scope)
  docs/workstream_briefs.md            (your workstream, WS-A)
  src/app/actions/structural.ts        (the server actions you will call)
  src/app/types/index.ts               (types)

Your job: build the inspector-facing capture surfaces. You own ONLY these paths:

  src/app/(dashboard)/document/**       (add panels and tabs)
  src/components/inspections/**          (create this directory)
  src/components/document/**             (add panels)
  src/components/settings/profile-form.tsx (new, profile self-service)

Deliver, in this order:

1. Settlement panel — enter tilt (mm/m) and differential settlement (mm) for the
   selected building. Call recordSettlementObservation. After saving, show the
   computed classification from SETTLEMENT_LABELS and the reason strings from
   explainSettlement so the inspector sees which threshold fired. Show the recent
   observations from getSettlementObservations.

2. Rebound hammer — a form to add N readings for a structural element. Show each
   reading, mark the rejected outliers returned in the summary, and display mean
   rebound plus estimated strength with REBOUND_CORRELATION_REFERENCE printed
   verbatim underneath. Never present the strength as a lab result.

3. Soil investigation — borehole, depth, classification, SPT N-value, groundwater
   depth, liquefaction susceptibility. Site/building level, not per inspection.
   List existing boreholes beneath the form.

4. Erosion — condition and type fields on the inspection, saved through
   updateInspectionRecord. Show what project-level score it feeds.

5. Forensic assessment — hypothesis, mechanism narrative, conclusion, next step.
   Evidence picker that attaches existing inspection images and detections via
   addForensicEvidence. Engineer/admin only; hide it for inspectors.

6. Checklist runner — render each template from getChecklistTemplates with its
   items. Prefill any item whose `auto` key matches a geospatial zone the site
   actually falls in, using the existing environmental data; mark prefilled items
   visually as suggestions the inspector can override. Save through
   saveChecklistResponse. Show the template version on screen.

7. Profile self-service — name, phone, department. All roles. Inspectors currently
   cannot reach /settings at all, so this must live somewhere they can reach.

Rules:
- Compute nothing structural in the component. The server already computed the
  classification, the outlier set, and the ACI band; display them.
- No data means a designed empty state, not a blank box.
- The UI must state when a value is an estimate (rebound strength, settlement
  thresholds) rather than presenting it as measured certainty.
```

---

# Prompt — WS-B · Engineer review

```
You are working in a Next.js 16 / React 19 / Tailwind v4 codebase for ePropView, a
structural inspection system. Read these first, in order:

  docs/capstone_v2_scope_contract.md
  docs/workstream_briefs.md            (your workstream, WS-B)
  src/app/actions/reports-v2.ts
  src/app/actions/structural.ts        (updateDetectionCrackTaxonomy)
  src/app/actions/gemini-analysis.ts
  src/app/lib/structural/cost-table.ts
  src/app/types/index.ts

Your job: the engineer's review and sign-off surfaces. You own ONLY these paths:

  src/app/(dashboard)/reports/**
  src/components/reports/**
  src/components/ai/**

Deliver, in this order:

1. Crack taxonomy panel — per detection: width in mm, orientation, pattern, cause.
   Show the ACI band and the exposure limit that produced it. Explain that the band
   is computed from the measurement, not chosen. Save via
   updateDetectionCrackTaxonomy.

2. Cost panel — call suggestRepairCost to get the AI range, display it beside the
   deterministic table value from tableEstimate. When divergenceFlag is true, show
   the divergenceReason prominently and require confirmCostEstimate with a written
   reason before the figure can be treated as agreed. Persist with saveCostEstimate.
   State on screen that these are planning-level figures, not quotations.

3. Recommendation panel — draftRecommendation, then an editable text area, then
   signRecommendation. Draft and signed states must be visually unmistakable. Only
   signed recommendations print. Show provenance.

4. Full report editing — every field, saved through updateReportWithRevision. Show
   the revision history from getReportRevisions with a readable diff of what
   changed. Completed reports stay locked until reopened.

5. Assessment limitation builder — the standard exclusion checklist plus free text
   plus per-element notes, saved via upsertReportLimitation and rendered into the
   print view as an explicit statement.

6. Per-element damage rollup — aggregate detections by structural element.

Rules:
- An AI figure must never appear as if a human produced it. Label provenance.
- The sign button is the only path from draft to report. Do not auto-sign.
- Do not modify the print CSS in a way that breaks existing report output.
- Empty states must explain what will populate the panel.
```

---

# Prompt — WS-C · Filters, export, map

```
You are working in a Next.js 16 / React 19 / Tailwind v4 codebase for ePropView, a
structural inspection system. Read these first, in order:

  docs/capstone_v2_scope_contract.md
  docs/workstream_briefs.md            (your workstream, WS-C)
  docs/usecase_parity_matrix.md        (the rows you are closing)
  src/components/reports/reports-table.tsx
  src/components/dashboard/geospatial-map.tsx
  src/proxy.ts

Your job: filters, export, sharing, heatmap, and the remaining route guards. You own
ONLY these paths:

  src/components/shared/**
  src/components/dashboard/**
  src/components/reports/reports-table.tsx
  src/app/(dashboard)/projects/**
  src/app/share/**                      (new public share route)

Deliver, in this order:

1. Shared filter bar — one component used by reports, the asset vault, maintenance
   and the dashboard. Filters: severity, damage type, crack category,
   building/floor/element, date range, status, verification state. State must be
   URL-synced so a link reproduces the view. Server-side filtering, not client
   filtering of everything. Saved presets are optional if time allows.

2. CSV export for reports, detections and maintenance. Generate on the server; do
   not build a CSV string in the browser from a page of results.

3. Report share link — tokenised read-only page under /share/[token]. It reads a
   report by token, honours expires_at and revoked_at, and shows the report, its
   signed recommendations and its limitation statement. Use the service-role client
   in the route handler only; never expose it to the browser.

4. Mapbox heatmap layer — toggleable, driven by hotspot severity and detection
   density. Do not break the existing zone fills or markers.

5. Route guards — /projects and /document must not be reachable by viewers. The
   proxy already blocks them; add the page-level guard as defence in depth and make
   sure a viewer who reaches /projects sees an access-denied state, not a crash.

Rules:
- The CSV must be correct with zero rows.
- A share link that is expired or revoked must say so clearly, not 404 silently.
- Do not change the Mapbox token handling or the existing zone-import code.
```

---

# Prompt — WS-D · Admin surfaces

```
You are working in a Next.js 16 / React 19 / Tailwind v4 codebase for ePropView, a
structural inspection system. Read these first, in order:

  docs/capstone_v2_scope_contract.md
  docs/workstream_briefs.md            (your workstream, WS-D)
  src/app/actions/reports-v2.ts        (getAuditEvents, share tokens)
  src/components/settings/**           (existing admin conventions)
  supabase/migrations/017_capstone_v2_domain.sql

Your job: the admin surfaces that close the remaining diagram gaps. You own ONLY
these paths:

  src/app/(dashboard)/settings/**
  src/components/settings/**

Deliver, in this order:

1. Audit log page — filterable view of getAuditEvents: actor, action, entity type,
   entity id, timestamp, and a readable summary of the before/after payload. Paginate.

2. System health page — real numbers only: row counts, failed AI analysis jobs,
   storage usage by bucket, and rate-limit activity. If a number cannot be obtained
   honestly, omit it rather than estimate.

3. Backup / restore — export a project's records as JSON; import with validation and
   a dry-run preview showing what would be created before anything is written. Label
   it plainly as a record export, not an infrastructure backup.

4. Project CRUD — create, edit, archive. Projects are currently seed-only. Archived
   projects must disappear from the active lists without deleting their history.

5. AI model registry editor — list models, activate/deactivate, edit metadata and
   thresholds. Label it as a registry, explicitly not a deployment pipeline.

6. Cost table and threshold configuration — surface COST_TABLE_VERSION, the tilt and
   settlement thresholds, and the divergence band so the admin can see what the
   system is applying.

Rules:
- Destructive actions need an in-page confirmation step, not a browser confirm
  dialog (they are blocked in this environment).
- Never show a fabricated metric. An unavailable figure is "unavailable".
- Restore must be idempotent and must report what it skipped.
```

---

## Reviewing what comes back

For each branch:

```bash
git fetch origin
git diff staging...origin/feat/inspector-capture --stat
git diff staging...origin/feat/inspector-capture
```

Check, in this order:

1. **Scope** — did it touch a contract file? That is a rejected change, even if the
   code works.
2. **Honesty** — is any AI output labelled, is any estimate labelled an estimate.
3. **Empty states** — does every new list survive zero rows.
4. **Gate** — the branch's CI run must be green on GitHub Actions.

Then merge into `staging` and let the preview rebuild:

```bash
git checkout staging
git merge --no-ff origin/feat/inspector-capture
git push origin staging
```

`main` stays untouched until you give the go signal.
