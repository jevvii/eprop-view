# Markerless session inspection

User authorized markerless WebXR, persistent checkpoints only if supported
reliably, otherwise one-time tracking with saved records.

## Checkpoint finding

The WebXR anchors draft includes requestPersistentHandle/restorePersistentAnchor,
but browser/device support cannot establish a reliable portable checkpoint.
Chromium's current XRSession/XRAnchor interfaces lack those persistence methods.
Persisted coordinates are relative to one session's origin and cannot restore
physical locations in another session. Implement session-only tracking and saving;
never draw old session points as physically restored checkpoints.

Sources checked: https://immersive-web.github.io/anchors/ and
https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/xr/xr_session.idl
and https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/modules/xr/xr_anchor.idl

## Behavior

- Markerless is the default inspection workflow. Retain the printed-reference
  option and existing saved records for users who explicitly select it.
- Capability-detect immersive-ar. Require hit-test and DOM overlay, request
  anchors optionally. Request the XR session directly in the Start gesture.
- Save a fresh hit pose and an explicit session key in pose metadata. Native
  anchors, when available, are queried each frame. Otherwise track fixed points
  in the current local reference frame. Project using the current viewer pose
  and projection matrix, never the old approximate screen formula.
- Hide overlays and disable placement when tracking/visibility is lost. Clear
  session-local markers after end or reference-space reset.
- Saving creates an owned active database session and uses existing server
  validation and deletion. Saved records remain after XR ends; they are labelled
  session-only and excluded from future session overlays.
- WebXR passthrough camera pixels are not automatically available to JavaScript.
  Permit a marker record without a photo; never fabricate evidence. Offer the
  camera/photo mode for evidence and unsupported browsers.
- Camera/photo mode is an image annotation, not spatial AR. Save its real photo
  and normalized image point. Never claim it is a physical world checkpoint.
- Clean up frame callbacks, native anchors, WebGL resources, streams, timers and
  pending work on stop/unmount. Handle OS-ended sessions and database failures.

## Verification

Pure tests cover matrix projection, session filtering, invalid metadata and
surface visibility. Browser tests emulate the XR boundary, then drive the actual
XR runtime and UI through hit, save, move, loss, end, restart, unsupported-device
camera capture and error paths. Existing QR tests remain valid. Run all tests,
lint, type checking and production build. Real ARCore/iPhone verification remains
unverified until actual devices are used; emulation does not prove hardware AR.

## Device workflow

1. Open the deployed HTTPS site and select Markerless / photo inspection.
2. On an immersive-WebXR-capable device, choose Start markerless AR and accept
   the browser prompt. Move slowly in a well-lit area until a surface is detected.
3. Aim the centre reticle, optionally enter a point label/notes, and Save surface
   point. Move the camera: the point follows its current-session reference frame.
4. End inspection. Saved records remain in the list; restarting does not restore
   their positions in the new coordinate system. This is intentional.
5. If immersive AR is unavailable or photo evidence is required, use Camera/photo
   inspection. Save captures a real image with a centre-point annotation. This
   mode provides no depth or physical world tracking and requires no printed QR.
6. The printed-reference option remains available for users who need repeatable
   target-based registration and are willing to keep a physical reference onsite.

## Automated checks

Run `npm test`, `npm run lint` and `npm run build`. Install the test browser with
`npx playwright install chromium`; then run `npm run test:markerless-browser` and
`npm run test:ar-browser`. `AR_TEST_BROWSER` optionally names an existing Chrome
executable. Browser artifacts default to the system temp directory. The markerless
harness uses the real runtime/UI/matrix projection with mocked XR/GL and database
boundaries, plus real synthetic-camera pixels for the camera/photo path. No live
user records or credentials are used. Physical ARCore accuracy, camera passthrough
presentation and iPhone behavior still need actual-device verification.
