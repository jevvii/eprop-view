# Printed-reference AR inspection

The user selected printed reference targets on walls/columns for the Android and
iPhone web app. Strengthen the existing inspection workflow around a real,
visible physical reference rather than synthetic camera/gyro coordinates.

## Accepted behavior

- Generate a downloadable, printable QR reference for the selected inspection
  and a named surface/element. Include a unique target ID and declared print size.
- Decode the reference from the existing live rear-camera stream. Derive a
  planar projective transform from its four detected corners, accounting for
  video cropping and viewport resizing.
- Store marker points in the target's coordinate frame, in existing `pose`
  JSONB metadata. No database migration or external tracking service is needed.
- Place a marker only while the correct inspection's target is freshly tracked.
  Quick Marker captures a real camera image and saves the target-relative point.
  The detailed form adds a description, manual defect classification and notes.
- Reproject saved points using each current observation. Hide labels and disable
  placement after tracking loss. Rescanning the same target restores saved points,
  including after reloading the page or starting a new session.
- Keep older markers readable/deletable in the list, explicitly labelled as
  lacking a printed reference. Never display them as tracked physical locations.
- Preserve role/ownership checks and verified marker deletion from main. Validate
  reference metadata at the server boundary and bind it to the inspection ID.

## Physical limits

The printed target and marked locations must share a flat, stationary surface.
The target must remain visible. This is planar marker-based AR, not markerless
SLAM, automatic structural recognition, depth measurement or safety assessment.
Metric offsets depend on printing the declared size; they are not surveyed
measurements. Analysis remains explicitly heuristic/manual.

## Verification

- Pure geometry tests: perspective, rotation, inverse mapping, cropping,
  resizing, degenerate targets, reference identity and invalid payloads.
- Decode generated references from real raster pixels; use transformed target
  fixtures to verify point movement, loss and reacquisition.
- Browser tests use a controlled camera stream with moving references and the
  real detector/rendering code. Check placement, photo capture, loss gating,
  wrong-inspection rejection and saved-marker restoration.
- Run the existing suite, lint, TypeScript and production build; review the diff.
- Record physical Android/iPhone testing as unverified unless those devices are
  actually available. Do not infer hardware accuracy from synthetic tests.

## Implementation order

1. Typed reference protocol, printable asset and tested planar geometry.
2. Camera tracking lifecycle and target-relative marker rendering.
3. Placement/evidence workflow, server validation and legacy marker handling.
4. Browser regression verification, documentation, review and shipment to main.

## Capstone demonstration

1. Select an inspection and give the target a surface name, such as "Column C3 — north face".
2. Create/download its SVG, print at 100%, and check the requested QR width
   excluding the white border. Attach it flat beside the area to inspect.
3. Start AR Session and show the complete target. Wait for "Reference tracked".
4. Tap the point on the same flat surface and use Quick Marker + photo. Use the
   detailed form when classification, severity and field notes are needed.
5. Move the camera sideways, rotate it, and change its distance while keeping the
   target visible. The saved point should remain at the corresponding location.
6. Cover the target: pins must disappear and placement must disable. Uncover it:
   saved pins must return. A target for another inspection must not enable placement.
7. End the session, reload, start again and scan the same target. The stored pins
   must return. Download again preserves its original identity; creating a new
   target intentionally creates another reference frame.

Never relocate or duplicate an attached reference to another physical surface:
its saved points are relative to that original location. The browser cannot
detect a moved print or establish a surveyed coordinate system. Keep references
and downloaded files under the inspection team's control.

## Validation record

Geometry/protocol tests rasterize generated SVGs and decode actual QR pixels.
Server-action tests use the real validation/persistence implementation with
isolated authentication/database boundaries. They cover active-session ownership,
inspection binding, coordinate normalization and evidence cleanup on failed insert.

The controlled Chromium camera test verifies UI-generated QR download, real
decoder input, movement, rotation, perspective, loss/reacquisition, foreign-target
rejection, photo/point locking, deletion and restoration after restart/reload at
390px and 1280px widths. Its measurements characterize a synthetic fixture, not
real-device accuracy. No physical Android/iPhone test has been performed here.

Run automated checks with `npm test`, `npm run lint` and `npm run build`.
For the browser regression, first install the test browser with
`npx playwright install chromium`, then run `npm run test:ar-browser` after the
build. `AR_TEST_BROWSER` can specify an existing Chrome executable. Artifacts
default to the system temporary directory under `epropview-reference-browser`;
`AR_TEST_ARTIFACTS` overrides the directory. The harness uses local fixture data
and an isolated browser profile; it does not contact Supabase or modify user data.

The QR decoder (`jsqr` 1.4.0) and SVG encoder (`qrcode-generator` 2.0.4) are pinned
and installed with lifecycle scripts disabled. Neither was flagged in the npm
audit performed for this change. The existing seven moderate findings in the
TypeScript ESLint development-tool dependency chain are outside this tracking
change; no high/critical findings were reported.

## Architecture

- The QR contains a versioned target ID, inspection ID, surface label and print
  width. It carries no account credentials and is not an authorization token.
- A bounded camera frame is decoded about seven times per second. Four QR corners
  determine a homography from the unit target square to video pixels. `object-cover`
  cropping is reversed for placement and reapplied for rendering.
- Coordinates and target metadata live in `ar_anchors.pose.reference` JSONB.
  Existing tables and RLS remain in use; no database migration is required.
- Tracking hides points after a short missed-frame tolerance (300ms), on paused
  or unavailable camera frames and on page hiding. Save handlers additionally
  reject stale observations. Tracking is local to the browser; only a photo saved
  by the inspector is uploaded to private storage.
- Saving verifies an active session belonging to the selected inspection and
  authorizes its owner/admin. Reference-local metric fields are derived on the
  server from print size, not accepted as independent measurements.
- Evidence capture freezes the video into a canvas and detects the target in
  those exact pixels before deriving the pose and encoding the JPEG. Continuous
  overlay tracking and evidence capture share the coordinate model, but capture
  never substitutes the last observed transform for a newer photograph. The
  browser test holds the tracking timer while moving/removing/replacing the
  target to exercise this distinction.
