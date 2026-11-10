# Remediation backlog

Items found by the audit that are outside the "critical + high" fix scope, or
that require a product decision or a device/platform that is not available.

## Blocking before any public deployment

1. **Rotate secrets** — Supabase service-role key, database password and the
   seeded `AdminPassword123!` / `EngineerPassword123!` / `InspectorPassword123!`
   accounts. Purge or regenerate `eprop-view-handover.zip`. Optionally rewrite
   git history with `git filter-repo` (destructive).
2. **Verify iOS on macOS/Xcode** — run `npx cap add ios`, copy
   `native/ios/App/App/*`, `pod install`, build on a device.
3. **Decide on tenant isolation** — most read policies are
   `USING (get_my_role() IS NOT NULL)`, so every active user can read all
   projects, profiles and operational data. Add project-membership scoping if
   that is not intended.

## Medium

- Mass-assignment hardening: `.strict()` zod allowlists for
  `actions/maintenance.ts`, `actions/environmental.ts`, `actions/buildings.ts`
  (several still spread `...updates` into the database).
- Replace the remaining hand-rolled modals with one native `<dialog>` primitive
  (focus trap, Escape, restore focus). Nine modals still lack dialog semantics.
- Bind the remaining labels in `maintenance-table.tsx`, `detection-list.tsx`
  and the settings managers.
- Storage audit lists only the bucket root while uploads are nested; walk
  prefixes or maintain the audit from upload/delete events.
- Signed URLs are created one request per image; use `createSignedUrls` in
  batches and paginate list queries.
- Replace the 31 `select('*')` calls with explicit column lists.
- Add a Mapbox-compatible CSP (nonce or hash, plus `worker-src blob:` and
  `img-src` for tiles).
- Remove the unreachable `.dark` token block or implement a theme switch.

## Low / polish

- Remaining `text-slate-400` instances (42) still fall below 4.5:1 on white in
  some surfaces; migrate them to `text-slate-500` or darker.
- Reduce the `text-xs` / `uppercase` density; headings below body size remain
  in a few card labels.
- Collapse the ad-hoc shadow/radius scales (`shadow-xs…2xl`, `rounded-[2rem]`)
  onto the token scale.
- Delete dead components: `stats-cards.tsx` (`StatsCards`), `report-modal.tsx`
  (never opened), `ar-unsupported-notice.tsx` (never mounted).
- Replace native `alert()` / `confirm()` (11 occurrences) with the dialog layer.
- ARCore camera renderer (Sceneform is archived; a GL renderer is a separate
  project). Until then the native build tracks but shows no preview.
- Remove the legacy `better-sqlite3` migration path if `backend/` is gone.
- `next.config.ts` allows `http://localhost` image hosts in every environment.
