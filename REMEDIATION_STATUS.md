# Capstone audit remediation — 12 November 2026

The audit identified 18 findings. F03 (active credentials) was explicitly excluded by the user, leaving 17 findings in scope. Source fixes are implemented, and migrations 018–022 are applied to the agreed Preview database. The updated Preview deployment and authenticated browser walkthrough pass, including live Gemini, review/signing, print, share revocation, and archive retrieval. No production changes, git push/merge, or account-password changes were performed. The user-provided Gemini key was configured only for Preview.

## Findings

| Finding | Implemented change | Verification and status |
| --- | --- | --- |
| F01 — unsafe archival | Verify copied bytes before committing bucket/path changes transactionally, then remove the original. Readers resolve persisted storage locations. Failed cleanup reports the retained duplicate. | Actual-action failure tests and SQL pointer tests pass locally. |
| F02 — excessive structural/report permissions | Migration 018 replaces permissive policies, restricts engineering approvals, protects signed records and report history, and limits viewer report access to completed reports. | Role, direct-write and signing SQL tests pass locally. |
| F04 — environment/schema mismatch | Preview-specific target guard, tracked transactional migrations, explicit legacy baseline, schema/role checks, and visible setup errors. Legacy SQLite runner removed. | Preview schema, required RPCs and all four active roles verified. Migrations 018–022 applied after confirming baseline 017; existing record counts preserved. Hosted Preview build ready. **Authenticated Preview walkthrough passed with the user-provided admin login.** |
| F05 — rejected Gemini provenance | Migration 021 accepts Gemini provenance and provides service-only transactional detection replacement, retaining reviewed findings and rolling back failed replacements. | Actual-action tests and real PostgreSQL persistence/rollback/risk-reset tests pass. Live Gemini negative-control vision passed; meaningful engineering accuracy is not certified. |
| F06 — nonexistent GIS columns | Hazard calculations use actual stored geometry through a PostGIS RPC. Missing coordinates/coverage remain unavailable. | Local PostGIS and action tests pass. |
| F07 — incorrect hazard membership | Full line distance, holes and multipolygons, active/date coverage, explicit checklist confirmation, coordinate validation and rejection of unsupported CRS. Both importers normalize risk labels consistently. | GIS/domain SQL and importer regressions pass. |
| F08 — incorrect ACI values | Correct exposure serviceability guidance, including a separate seawater category; distinguish project width bands and screening thresholds from code limits. | Domain regression tests pass. This is not an engineering validation study. |
| F09 — report lifecycle gaps | Locked completion/reopening, optimistic concurrency, atomic revisions, current recommendation signing and divergent-cost confirmation requirements. | Real database workflow and action tests pass. |
| F10 — incomplete/misleading print | Printable signed recommendations, limitations, costs, evidence, review details and provenance; print waits for decoded photographs, blocks failed evidence loads, and preserves the report header. Authority claims corrected. | Actual component/action tests and browser-generated PDF checks pass; the PDF embeds the photograph and header, and simulated image failures block publication. |
| F11 — fixed recommendation inputs | Draft context derives from stored reviewed findings and structural context. Gemini, heuristic and engineer provenance are distinguished. Empty drafting responses are rejected. | Action tests and live recommendation/narrative requests pass. Outputs remain drafts requiring engineer review. |
| F12 — ineffective auth throttling | Server-service-only rate budgets, fail-closed checks and hashed account identifiers. | Auth action regressions and PostgreSQL budget/privilege tests pass. |
| F13 — incomplete shared filtering/integration | URL filters, browser presets, server-side record filtering, filtered dashboard statistics/chart, movement overview, persisted crack weighting and erosion inputs. | URL/validation tests, SQL filter/chart tests, preset/browser checks and GIS/domain tests pass. |
| F14 — incomplete record transfer | Versioned, explicitly bounded operational record export/import; related IDs remapped in one transaction; signatures invalidated. Paginated CSV reads and formula escaping; stale recommendations excluded. | Round-trip/rollback, pagination, CSV and SQL tests pass. Binaries and omitted history are not backed up. |
| F15 — misleading green checks | ESLint covers TypeScript/TSX, actual modules tested at external boundaries, and CI runs migrations plus permission/workflow SQL tests. | Typecheck, lint, 202 application tests and production build pass. Lint retains 55 warnings, mainly legacy typing/unused/image issues. |
| F16 — inaccessible controls/modals | Native report/provision dialogs, labelled settings fields and project selector, correct settings button state, structural tab relationships and keyboard behavior. | Browser confirms settings labels, dialog Escape/focus return and reports at 320/390 px. Full assistive-technology conformance was not tested. |
| F17 — falsely advertised snapshots | Completed reports create immutable public snapshots with expiry and a persistent list/revocation control on the report screen. | SQL/action tests and authenticated browser tests pass, including revocation after refresh and snapshot immutability after reopening. |
| F18 — callback open redirect | Callback accepts only local same-origin destinations and rejects protocol-relative/backslash/control-character escapes. | Auth redirect regression tests pass. |

## Verification evidence

- `npm test`: **202 passed, 0 failed, 0 skipped**.
- `npm run typecheck`: passed.
- `npm run lint`: passed, **0 errors and 55 warnings**; explicit TS/TSX coverage check passed.
- `npm run build`: passed.
- All 23 SQL files in versions **001–022** applied to a fresh, disposable PostgreSQL 18 / PostGIS 3.6 database. All five SQL suites passed: `ai_auth.sql`, `geospatial_domain.sql`, `report_integrity.sql`, `storage_records.sql`, and `workspace_filters.sql`.
- Remediation migrations **018–022** reapplied, and all five suites passed again. Early legacy migrations are not uniformly idempotent; the tracked runner skips them once recorded and refuses an untracked existing database without an explicit verified baseline.
- Browser reference and markerless AR suites passed at 390 and 1280 px with simulated camera/XR fixtures. These do not establish physical device accuracy.
- Browser checks passed for login, settings labels, URL/preset filters, responsive reports, native modal Escape/focus return, and the authenticated Preview workflow described below. The final Preview also passed delayed/broken image publication tests, PDF image/header checks, persistent share revocation, and archive retrieval/deletion.
- Dependency audit: **0 high/critical, 7 moderate** reports in the ESLint/TypeScript-ESLint/minimatch development-tool chain. No forced dependency upgrades were applied.

The GitHub Actions PostGIS job is configured; a successful hosted CI run has not been observed in this session.

## Live Preview verification

Preview: [eprop-view-it7w9oikz-jevviis-projects.vercel.app](https://eprop-view-it7w9oikz-jevviis-projects.vercel.app), Vercel state **READY**. The latest CLI deployment used the tested workspace; no git push or production deployment was performed. Deployment input was checked to exclude `.env*` and `docs/`, including the tracked credentials document.

The database verifier now checks required RPC signatures as well as tables and active roles. The Preview database passed role/signing/completion/revision/share workflow checks, Gemini provenance and transactional replacement checks, service-only permissions, and the statistics/chart/geospatial/movement RPC checks. Fixture transactions rolled back; existing project/report/inspection/image counts are unchanged. The migration ledger records all 23 files, including the confirmed legacy baseline.

The user-provided Preview admin credentials authenticated successfully. Browser checks passed for system health, server filters, 320/390 px layouts, modal Escape behavior, a signed image upload, actual Gemini photo analysis, engineer verification, report creation, narrative and cost generation, recommendation generation/signing, completion locking and explicit reopening, public snapshot immutability, and revocation after a refresh. All four analysis paths persisted `gemini` provenance in this authenticated workflow; narrative required a retry during provider overload.

The walkthrough exposed two additional print defects: the report header inherited the dashboard header's print hiding rule, and a PDF could be generated before its image decoded. Both were fixed. The final browser test deliberately delayed the image and confirmed printing stayed unready, then generated a PDF with its header and one embedded photograph. A simulated failed image produced a visible error and blocked publication. Image readiness uses the documented [HTMLImageElement.decode() API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode).

Share links now remain listed after a page refresh, with an explicit revoke control. A browser check reopened and edited the temporary report, confirmed its public snapshot retained the old content, then revoked the link and confirmed the public page hid the content.

Storage indexing, verified archival copy, pointer switching, original removal, and vault retrieval from the archive bucket passed through the UI. The archived test image was deleted through the vault. The temporary project and its child records were removed afterward, restoring the original project/report/inspection/image counts. Audit history was retained. No account password was changed.

Machine-readable evidence: [Preview verification](verification/preview-2026-11-12.json).

## Gemini: what is and is not established

**All four analysis paths returned validated real Google responses:** image negative control, repair cost, recommendation and narrative. They used `gemini-3.5-flash-lite` after primary-model availability failures. The narrative initially failed on both models and succeeded on a separate action retry, so service availability is not uniformly reliable.

The live test exposed a concrete resilience gap: the client previously advanced models only on HTTP 429. Gemini 3.8 returned HTTP 503 or exceeded the request deadline. The client now advances through the bounded model chain on quota exhaustion, HTTP 408/500/502/503/504, and connection failures/timeouts. Each model is attempted at most once. Request, authorization and malformed-output errors are not retried. Regression tests cover these distinctions. Deprecated sampling overrides are omitted for Gemini 3/4, following [Google's troubleshooting guidance](https://aistudio.google.com/docs/troubleshooting).

The tests used the actual action/client code and real Google HTTP responses, with an operator admin context and actual PostgreSQL rate budgets in the CLI harness. Subsequent browser tests also established successful authenticated web actions for all four analysis paths; the original CLI results and the web results are distinguished in the evidence file. The model/client JSON schemas and deliberate-action prompts were unchanged between the CLI probes and the application.

Observed output:

- A uniform gray negative-control image returned no visible defect and no physical measurements.
- A supplied synthetic spalled-column finding produced a PHP 15,000–120,000 planning range, likely PHP 35,000. Its basis explicitly assumed an estimated repair area; that quantity is hypothetical, not a measured reading.
- The recommendation requested professional assessment and site measurements before repair specifications.
- The narrative described the supplied synthetic finding and identified the absence of measured strength, crack width, tilt and settlement.

Full synthetic outputs are in [Gemini verification evidence](verification/gemini-live-2026-11-12.json). No confidential inspection images were sent.

Interpretation:

- These establish connectivity, fallback behavior and usable draft content for the tested fixtures. They are not an accuracy benchmark or proof of structural safety.
- Model confidence and heuristic response strength are uncalibrated. Physical crack width, concrete strength, tilt and settlement must come from actual measurements.
- Costs remain provisional planning assumptions; recommendations and narratives need engineer review before publication.
- The Vercel export initially contained `[SENSITIVE]` placeholders. The earlier invalid-key response came from a placeholder and did not establish that the deployed key was invalid. The newly supplied actual key supports inference.

## Remaining scope limitations

The requested code remediation and authenticated Preview verification are complete. This does not establish engineering accuracy, structural safety, physical-device AR accuracy, native iOS behavior, exhaustive accessibility conformance, or production readiness under load. These were not the verification target.

For the capstone evaluation, use representative annotated positive and negative images and document engineer review. Synthetic integration tests are not a scientific defect-detection accuracy benchmark. Gemini service capacity remains variable; tested fallback behavior keeps that limitation visible.
