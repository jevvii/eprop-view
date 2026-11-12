# EPROPVIEW

EPROPVIEW is an undergraduate computer science capstone for recording property inspections, organizing photographic evidence, reviewing environmental hazards, and preparing engineer-reviewed reports. It uses Next.js 16, React 19, TypeScript, Supabase Auth/PostgreSQL/PostGIS/Storage, Mapbox, and TanStack Query.

## Features and boundaries

- Projects, buildings, floors, structural elements, inspections, and role-based access for admins, engineers, inspectors, and viewers.
- A geospatial dashboard with stored hazard layers, fault proximity, hazard-zone membership, erosion observations, maintenance priorities, and manually entered movement observations. Missing source coverage is identified explicitly.
- Private inspection photographs, comments, signed evidence URLs, and verified archival copies. Archival uses a second Supabase bucket; it is not an implemented external S3/Storj replication service.
- Browser AR reference tracking and markerless inspection records. Tracking is device-dependent; saved photographs can be deliberately submitted for deeper analysis. AR does not measure structural capacity, crack width, tilt, or settlement.
- Camera and AR access are requested from the Start button. If a saved denial suppresses the prompt, restore this site’s Camera permission to Allow or Ask, check the browser’s camera access in device settings, then tap Start again. Previously granted access may start without another prompt. See the [browser permission rules](https://w3c.github.io/mediacapture-main/#dom-mediadevices-getusermedia).
- Deterministic visual heuristics for live analysis, plus optional Gemini image classification, repair-cost suggestions, recommendations, and report narrative drafts. There is no trained defect-detection model or validated prediction-accuracy claim.
- Structural observations including crack taxonomy, manually measured crack widths, settlement, rebound-hammer readings, soil investigation, erosion, and forensic assessments. Rebound strength correlation is indicative and requires calibration. Crack width bands are project-defined; ACI exposure limits are separate serviceability guidance.
- Report revisions, optimistic concurrency checks, review requirements, engineer signatures, completed-report locking and reopening, printable evidence and limitations, and expiring/revocable public snapshots.
- Shared URL filters and local saved filter presets across the dashboard, document workspace, and reports. Structural/detection filters for project-level maintenance and hotspots match inspections in that project.
- CSV export and versioned JSON record export/import. JSON is an operational record subset, not a database or infrastructure backup. Binaries, users, audit/revision history, public links, and some evidence links are omitted. Imports invalidate approvals and restore reports as open drafts.

## Local development

Use Node.js 24 and install dependencies with `npm ci`. Set these in an untracked `.env.local` for the database you intend to use:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-key
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your-mapbox-token
NEXT_PUBLIC_SITE_URL=http://localhost:3000
GEMINI_API_KEY=your-optional-server-only-key
```

Never put service-role or Gemini keys in `NEXT_PUBLIC_*` variables. `npm run dev` starts development; `npm run build` and `npm run start` run the production build.

## Database and Preview verification

SQL migrations live in `supabase/migrations/`. Apply them in numeric order to a Supabase project, including migrations 017–022 for the structural features and audit remediation. The legacy SQLite migration utility has been removed.

The CLI migration commands enforce the agreed Preview project, `gbuwldihkmapzondxkto`, and read `.env.preview.local`. Set its actual PostgreSQL URI as `PREVIEW_DATABASE_URL` in that file or the shell environment, then run:

```bash
npm run verify:preview
npm run db:migrate:preview
```

`npm run db:migrate` uses the same Preview guard. An existing database without an application migration ledger requires inspection of its applied migrations first. Pass `-- --baseline=016` only if migration 016 is confirmed as its last applied migration; substitute the actual confirmed version. Subsequent runs skip tracked migrations and record each successful migration transactionally. Early legacy migrations are not all safe to replay.

Vercel CLI environment exports replace sensitive values with `[SENSITIVE]`. Those placeholders are not credentials and cannot establish whether the deployed key works. A Supabase API key is also not a PostgreSQL connection string. The verifier reports missing schema and absent demonstration roles rather than presenting setup as complete. Provision active admin, engineer, inspector, and viewer accounts for the capstone demonstration.

## Gemini behavior

Remote analysis happens on deliberate actions, not live camera frames. Validated Gemini responses are identified as `gemini`; deterministic fallback results are identified as `heuristic`. Reviewed engineering inputs and signatures remain separate. Model confidence and heuristic response strength are uncalibrated scores, not measured accuracy. Costs are provisional PHP planning ranges, not quotations.

The client tries `gemini-3.8-flash`, then `gemini-3.5-flash-lite` on quota exhaustion, temporary HTTP 408/500/502/503/504 errors, or connection timeouts/failures. Each model is attempted at most once; authorization, request and validation errors are not retried. Availability failures surface an identified fallback; malformed output is rejected. Existing reviewed findings survive replacement failures. Photos without a calibrated scale cannot create physical crack-width readings.

An admin can use **Settings → System Health → Verify Gemini** on the runtime that holds the actual key. This makes up to four synthetic integration requests for image analysis, cost, recommendation, and narrative output. Passing these probes establishes connectivity and schema behavior, not engineering accuracy. Meaningful performance still requires an annotated evaluation set and engineer review. Free-tier submissions may be used by Google to improve products; use demonstration data without confidential/client-identifiable imagery.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:ar-browser
npm run test:markerless-browser
```

Lint explicitly includes server `.ts` and React `.tsx` files. CI also applies all migrations to a disposable PostGIS database and runs the SQL suites in `supabase/tests/`. `bootstrap.sql` emulates Supabase platform boundaries for local/CI tests; it must not be applied to a managed Supabase instance.

See [REMEDIATION_STATUS.md](./REMEDIATION_STATUS.md) for the audit findings, verification evidence, and outstanding external checks. The scope contract is in `docs/capstone_v2_scope_contract.md` when the accompanying project documentation is present.

## License and ownership

This software and its associated documentation are proprietary and confidential. Unauthorized copying, distribution, or modification is strictly prohibited. All rights reserved by the client organization upon completion of official handoff sign-off.
