# Mobile AR camera preview investigation

## Symptom and cause

On `main` at `ae6f273`, the AR inspection view could show a black camera
viewport on narrow screens while Capture Frame returned a real camera image.

Below the `sm` breakpoint (640 CSS pixels), `#ar-viewport` had only
`min-h-[380px]`. Its child, `ARCameraView`, used `h-full`, with all its
contents positioned absolutely. The percentage height had no explicit parent
height to resolve against, so the camera view collapsed to zero height. Its
`overflow-hidden` clipped the video and HUD. The outer viewport's dark
background remained visible.

This follows the [CSS percentage-height rule](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/height#formal_definition):
a percentage height on a non-absolutely-positioned element computes to `auto`
when its containing block has no explicit height.

Capture was unaffected because `captureCurrentFrame()` draws the decoded
video into a fresh canvas using `videoWidth` and `videoHeight`, independent
of the video's CSS dimensions. Retrying permissions or playback cannot
repair a zero-height display area.

## Reproduction evidence

A temporary Next.js route mounted the real `ARSessionManager` and
`ARCameraView` inside the inspection page's viewport/grid classes. Chromium
used its synthetic camera, without an authenticated account or database writes.

At a 390 x 844 viewport before the fix:

| Measurement | Result |
| --- | --- |
| Outer viewport | 358 x 380 px |
| Camera view and displayed video | 356 x 0 px |
| Decoded video | 1280 x 720 px |
| Playback | `paused: false`, `readyState: 4` |
| Captured JPEG data URL | 16,523 characters |
| Uncaught page errors | None |

At 1024 x 844, the responsive explicit height already yielded a visible
568 x 622 px camera view. The reproduction asserted a nonzero preview
height and failed on the phone layout despite successful capture.

## Fix and regression checks

Add `h-[380px]` to `#ar-viewport`, retaining its minimum height and existing
tablet/desktop height overrides. This gives the child camera view a definite
height at every breakpoint.

After the fix, the Chromium reproduction passed at widths 375, 390, 639,
640, 768 and 1024 with an 844px height, plus 844 x 390 landscape. Each case
ended and restarted the camera, displayed live video, captured a JPEG and
reported no uncaught page errors. At 390 x 844 the displayed camera view
changed from 356 x 0 to 356 x 378 px. The 640px and 1024px height overrides
continued to work.

For a device regression check:

1. Open an inspection's AR view below 640 CSS pixels wide and start camera mode.
2. Confirm live video and the HUD fill the viewport.
3. Capture a frame and confirm it matches the scene.
4. End and restart the session; confirm preview and capture work again.
5. Rotate to landscape and repeat at the 640px and 1024px layout breakpoints.

In browser developer tools, verify the video's displayed dimensions as well
as its decoded dimensions. A healthy `readyState` or successful JPEG capture
alone does not prove the preview is visible.

The local reproduction uses synthetic camera frames. Physical Android and
iOS device verification remains a separate check; the local WebKit binary
cannot launch because `libicudata.so.74` is missing.
