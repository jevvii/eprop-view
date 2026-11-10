# Capstone v2 — Handoff State

**Branch:** `feat/capstone-v2-contract`
**As of:** 2026-11-12, overnight run
**Status:** contract layer complete · UI workstreams not started · nothing merged to `main`

---

## What is done

| Layer | State |
|---|---|
| Scope contract | `docs/capstone_v2_scope_contract.md` — agreed, binding |
| Use-case parity matrix | `docs/usecase_parity_matrix.md` — 51 nodes: 31 met, 10 partial, 10 missing at baseline |
| Workstream briefs | `docs/workstream_briefs.md` — file ownership so parallel work cannot collide |
| Migration `017` | 14 tables + columns, RLS on all, written and committed |
| Domain logic | crack taxonomy, cost table, settlement, rebound — pure and unit-tested |
| Server actions | structural, reports-v2, gemini-analysis — zod, capability-checked, audited |
| AI client | server-only, quota-guarded, documented fallback chain |
| Audit trail | `audit_events` + `log_audit_event` (actor stamped server-side) |
| Route guards | viewers blocked from `/document` and `/projects` by direct URL |
| Dead code | `better-sqlite3` migration path removed |
| Verification gate | `tsc`, `eslint`, 58 tests, `next build` — all green locally and in CI |

CI: typecheck · lint · test · build on every push, ~1m15s.

---

## What is BLOCKED on you

### 1. Migration 017 is not applied to the preview database

The SQL is committed but never executed — the preview database password is not
available to the agent that wrote it.

```bash
cd /home/javvii/FreelanceProject/Project5/worktrees/staging
psql "$PREVIEW_DB" -v ON_ERROR_STOP=1 -f supabase/migrations/017_capstone_v2_domain.sql
```

Idempotent; safe to re-run. Then verify:

```bash
psql "$PREVIEW_DB" -c "select count(*) from information_schema.tables
  where table_schema='public' and table_name in (
  'settlement_observations','rebound_tests','rebound_readings','soil_investigations',
  'forensic_assessments','forensic_evidence','checklist_templates','checklist_responses',
  'report_revisions','report_limitations','cost_estimates','recommendations',
  'audit_events','share_tokens');"
```

Expect `14`.

```bash
psql "$PREVIEW_DB" -c "select code, version from checklist_templates order by code;"
```

Expect `flood_map` and `geohazard_map`, both version `1`.

### 2. `GEMINI_API_KEY` on Preview

Already added during setup. Verify it is Preview-scoped only; it must never be
`NEXT_PUBLIC_`.

Without it the app still works: every AI entry point degrades to the
deterministic heuristic and says so.

---

## What is next

The four UI workstreams in `docs/workstream_briefs.md` are unblocked the moment
migration 017 lands. Each brief is written to be handed over verbatim.

| Workstream | Owner | Branch | Scope |
|---|---|---|---|
| WS-A | Antigravity | `feat/inspector-capture` | tilt, rebound, soil, erosion, forensic, checklists, profile |
| WS-B | Antigravity | `feat/engineer-review` | crack taxonomy UI, cost panel, recommendation, full report edit, limitations |
| WS-C | Antigravity | `feat/filters-export-map` | shared filter bar, CSV export, share link, heatmap, page guards |
| WS-D | Antigravity | `feat/admin-surfaces` | audit log, health, backup/restore, project CRUD, registry editor |

**Collision rule:** WS-A through WS-D must not edit files outside their listed
ownership. Anything else is a contract change and stops for review.

---

## Known gaps in the contract layer

* `share_tokens` has no public read route yet — that belongs to WS-C.
* Export (CSV) and the share page are specified but not implemented.
* The heatmap layer does not exist yet.
* `report_limitations` and `recommendations` are exposed to the print view only
  once WS-B wires them in.
* Existing pages still call `select('*')`; the remediation backlog item stands.

---

## Merge rules

* `staging` accepts feature merges freely.
* `main` is production and changes only on the owner's explicit go signal.
* Nothing in this branch has touched `main`.
