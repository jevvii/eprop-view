# EPROPVIEW system audit and remediation

Date: 2026-11-11
Branch: `fix/ar-mobile-and-ui-overhaul` (local commits only; **not merged**)
Scope: whole system — UI/UX, mobile, AI, AR, backend, RBAC, migrations, dependencies, loading performance.

## Verdict

The system had three independent full-admin escalation paths, a service-role
backdoor API, fabricated AI output presented as YOLOv8 inference, a non-buildable
native project, and roughly 800 KB gzip of initial JS on the two map routes.
Those are fixed and verified. The remaining work is listed in
`REMEDIATION_BACKLOG.md`.

## Commits

| Commit | Area |
|---|---|
| `768428b` | Roles come from `profiles`; escalation paths closed; migration 015 |
| `21c1b3a` | Route guard actually registered from `src/proxy.ts` |
| `f59a0b6` | Honest AI pipeline; AR lifecycle, permissions and events; migration 016 |
| `56cc29a` | Buildable Android project and aligned native bridge contract |
| `2630360` | Mobile layout repair, fabricated data removal, tokens and accessibility |
| `fb9262c` | Next/zod/sharp upgrades, audit cleanup, dynamic imports |

## Verification evidence

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Tests | `npm run test` | 37/37 pass |
| Build | `npm run build` | exit 0, `Proxy (Middleware)` registered |
| Runtime advisories | `npm audit --omit=dev` | **0 vulnerabilities** |
| All advisories | `npm audit` | 7 moderate, dev-only, no fixed release |
| Initial JS `/dashboard` | prerendered HTML chunks | **801 KB → 294 KB gzip (−63%)** |
| Initial JS `/environmental` | prerendered HTML chunks | **798 KB → 292 KB gzip (−63%)** |
| Android | `./gradlew assembleDebug` | BUILD SUCCESSFUL, 4.5 MB APK |
| Android launch | Pixel_7 emulator | installed, launched, WebView initialised, no fatal exception |
| Route guard | `curl` unauthenticated | `/dashboard`, `/ar`, `/settings` → 307 `/` |
| Live RBAC probe | Supabase anon client | 9/9 pass (below) |

Live RBAC probe results against the remote project:

```
PASS  inspector login
PASS  user_metadata spoof ignored            get_my_role=inspector
PASS  profiles.role write blocked            Only admins may change role or active status
PASS  geohazard RPC admin-only               Admin role required
PASS  active model is heuristic              Edge-Gradient Heuristic / heuristic
PASS  admin login / admin role resolved       get_my_role=admin
PASS  admin can read profiles                5 rows
```

## What was fixed

### Security
- `get_my_role()` reads `profiles` only; `user_metadata` is ignored everywhere.
- Non-admin writes to `profiles.role` / `is_active` are rejected by a trigger.
- Signup trigger always creates `viewer`, regardless of supplied metadata.
- Deactivation returns NULL from `get_my_role()`, so RLS denies on the next request.
- `/api/migrate` and hardcoded seed accounts removed; migration CLI requires
  explicit passwords, has no project fallback and verifies TLS.
- Inspectors can delete their own AI detections (no more silent duplicates).
- `upsert_geospatial_zone` is admin-only, pins `search_path`, revoked from `anon`.
- Uploads use signed direct-to-storage URLs plus `sharp` format verification and
  EXIF-aware re-encode; deletion uses the database path, never a client path.
- Rate limiting on login, signup, uploads, AI analysis, AR anchors and imports.
- Zip/shapefile parsing capped against zip bombs and oversized geometry.
- HSTS, Referrer-Policy and Permissions-Policy added.

### AI
- Real `sharp` decoding of JPEG/PNG/WebP with EXIF orientation.
- Removed the guaranteed fake detection, canned catalog and identifier-as-pixels path.
- Zero detections is a valid result; failures surface and invalidate the job.
- Provenance stored per detection; the mock registry is relabelled as a heuristic.
- Bounding boxes are normalized image space; overlay alignment fixed.
- Class-aware NMS; idempotent maintenance-ticket creation.

### AR
- WebXR only reported when `isSessionSupported('immersive-ar')` is true.
- iOS motion permission requested from the Start gesture; denial is visible.
- Native camera permission requested before starting.
- One event channel; typed payloads; cancellation-safe cleanup.
- DB session rehydrated on mount and closed on unmount.
- Snapshots uploaded to storage and served by signed URLs.
- Screen-space markers are labelled as such; no plane-locking claims.

### Native
- Complete Android project (Gradle wrapper, manifest, app module, MainActivity,
  resources, ARCore dependency); builds and launches.
- iOS sources complete (Info.plist, AppDelegate, plugin registration), uncompiled
  on Linux.
- Duplicate stub plugin copies removed.

### UI/UX
- Header truncation, single map mount, drawer scroll/safe-area, one scroll owner,
  document order, print grid, sticky table actions, AR scroll lock.
- Fabricated teams, trends, coordinates, latency, storage/audit claims removed.
- Semantic severity tokens; Lucide replaces emoji; global focus ring; reduced
  motion; select chevrons; 3:1 input borders; bound labels; keyboard rows;
  route loading skeleton; branded not-found; skip link; one `h1` per page.

### Performance
- Mapbox and Chart.js load through `next/dynamic`; client-side zod removed.
- Next 16.4.6, zod 4.6.7, sharp 0.35.5; shadcn CLI removed from the runtime tree.

## Residual risk (explicit)

1. **Secrets were not rotated.** `eprop-view-handover.zip` still contains the
   live service-role key and `AdminPassword123!` remains in git history. You
   chose code-only cleanup; rotate the key and passwords in Supabase.
2. **iOS is uncompiled.** No Xcode on Linux; sources are complete but unverified.
3. **No native camera renderer.** ARCore tracks and anchors, but the camera feed
   is not drawn; browser AR is the working preview path.
4. **7 dev-only moderate advisories** remain in `@typescript-eslint`; no fixed
   release is available.
5. CSP was deliberately not added; Mapbox requires inline styles and workers.
