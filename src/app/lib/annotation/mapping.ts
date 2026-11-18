import type { BoundingBox, DamageType, SeverityLevel } from '@/app/types'

/**
 * Maps a heuristic or model detection into an annotation candidate.
 *
 * A candidate is a draft, never a label. It carries the confidence the detector
 * reported so an engineer's accept/edit can later be scored against what was
 * actually proposed.
 */

export interface DetectionLike {
  damage_type: DamageType
  severity: SeverityLevel
  severity_score: number
  confidence: number
  bbox: BoundingBox | null
}

export interface AnnotationCandidate {
  damageType: DamageType
  severity: SeverityLevel
  geometryKind: 'box'
  bbox: BoundingBox
  sourceConfidence: number
}

export function isPlausibleBbox(bbox: BoundingBox | null | undefined): bbox is BoundingBox {
  if (!bbox) return false
  const { x, y, width, height } = bbox
  if (![x, y, width, height].every(Number.isFinite)) return false
  if (width <= 0 || height <= 0) return false
  if (x < 0 || y < 0) return false
  return x + width <= 1.0001 && y + height <= 1.0001
}

export function mapDetectionToCandidate(detection: DetectionLike): AnnotationCandidate {
  if (detection.damage_type === 'none') {
    throw new Error('A "none" detection has no geometry to propose')
  }
  if (!isPlausibleBbox(detection.bbox)) {
    throw new Error('Detection box is degenerate or outside the image')
  }

  return {
    damageType: detection.damage_type,
    severity: detection.severity,
    geometryKind: 'box',
    bbox: detection.bbox,
    sourceConfidence: detection.confidence,
  }
}
