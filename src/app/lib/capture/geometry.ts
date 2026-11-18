import type {
  CaptureMetadataInput,
  ElementType,
  LightingCondition,
  ScaleSource,
  SurfaceState,
} from '@/app/types'

/**
 * Capture geometry.
 *
 * These helpers decide what an image's numbers mean. They are pure so the
 * honest failure modes — a swapped orientation, a rescaled GSD, an ineligible
 * image — are testable without a database or a browser.
 */

/** Below this, an image carries too little surface detail to label usefully. */
export const MIN_TRAINING_PIXELS = 1_500_000

/**
 * EXIF orientation 5–8 transposes the image, so the dimensions sharp reports
 * are the unrotated ones. GSD is recorded against the oriented image because
 * that is what is stored and what an annotator sees.
 */
export function orientedDimensions(meta: {
  width?: number
  height?: number
  orientation?: number
}): { width: number; height: number } {
  const { width, height, orientation } = meta
  if (!width || !height || width <= 0 || height <= 0) {
    throw new Error('Image dimensions are unavailable')
  }
  if (orientation !== undefined && orientation >= 5) {
    return { width: height, height: width }
  }
  return { width, height }
}

/**
 * A GSD measured at source resolution grows when the image is downscaled,
 * because each stored pixel now covers more millimetres.
 */
export function rescaleGsdToStored(
  gsdMmPerPx: number,
  sourceWidthPx: number,
  storedWidthPx: number
): number {
  if (sourceWidthPx <= 0 || storedWidthPx <= 0) {
    throw new Error('Stored dimensions are unavailable')
  }
  return (gsdMmPerPx * sourceWidthPx) / storedWidthPx
}

/** Millimetres per pixel implied by a printed target of known physical size. */
export function gsdFromReference(targetSizeMm: number, observedWidthPx: number): number {
  if (observedWidthPx <= 0) {
    throw new Error('Reference target was not measurable in the frame')
  }
  return targetSizeMm / observedWidthPx
}

export function computeTrainingEligible(input: {
  widthPx: number
  heightPx: number
  synthetic?: boolean
  unusable?: boolean
}): boolean {
  if (input.synthetic || input.unusable) return false
  return input.widthPx * input.heightPx >= MIN_TRAINING_PIXELS
}

/**
 * Crack width in millimetres, or null when the image has no metric scale.
 * Null is the honest answer; a guessed width would be worse than none.
 */
export function deriveCrackWidthMm(
  measuredWidthPx: number | null,
  gsdMmPerPx: number | null
): number | null {
  if (measuredWidthPx === null || gsdMmPerPx === null) return null
  if (!Number.isFinite(measuredWidthPx) || !Number.isFinite(gsdMmPerPx)) return null
  return measuredWidthPx * gsdMmPerPx
}

export interface CaptureRow {
  source_width_px: number
  source_height_px: number
  width_px: number
  height_px: number
  captured_at: string | null
  distance_mm: number | null
  gsd_mm_per_px: number | null
  scale_source: ScaleSource
  lighting: LightingCondition | null
  surface_state: SurfaceState | null
  element_type: ElementType | null
  training_eligible: boolean
  camera_model: string | null
  capture_notes: string
}

/**
 * Maps decoded image metadata plus the capture form into the columns
 * inspection_images stores. Anything unknown stays null rather than defaulting
 * to a plausible-looking value.
 */
export function buildCaptureRow(input: {
  metadata: { width?: number; height?: number; orientation?: number }
  storedWidth: number
  storedHeight: number
  capture?: CaptureMetadataInput | null
}): CaptureRow {
  const source = orientedDimensions(input.metadata)
  const capture = input.capture ?? null

  const gsd =
    capture?.gsdMmPerPx != null
      ? rescaleGsdToStored(capture.gsdMmPerPx, source.width, input.storedWidth)
      : null

  const scaleSource: ScaleSource =
    capture?.scaleSource ?? (gsd !== null ? 'manual_gsd' : 'unknown')

  return {
    source_width_px: source.width,
    source_height_px: source.height,
    width_px: input.storedWidth,
    height_px: input.storedHeight,
    captured_at: null,
    distance_mm: capture?.distanceMm ?? null,
    gsd_mm_per_px: gsd,
    scale_source: scaleSource,
    lighting: capture?.lighting ?? null,
    surface_state: capture?.surfaceState ?? null,
    element_type: capture?.elementType ?? null,
    training_eligible: computeTrainingEligible({
      widthPx: input.storedWidth,
      heightPx: input.storedHeight,
    }),
    camera_model: null,
    capture_notes: '',
  }
}
