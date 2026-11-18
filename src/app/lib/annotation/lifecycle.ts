import type { AnnotationStatus } from '@/app/types'

/**
 * Annotation lifecycle.
 *
 * Kept separate from the actions so the two rules that matter — approval is
 * idempotent, and an approved annotation is frozen — are testable without a
 * database.
 */

/** Only a submitted annotation moves on review; re-approving is a no-op. */
export function nextStatusAfterReview(
  current: AnnotationStatus,
  decision: 'approved' | 'rejected'
): AnnotationStatus {
  return current === 'submitted' ? decision : current
}

export function canEditAnnotation(status: AnnotationStatus): boolean {
  return status === 'draft' || status === 'submitted'
}

type CandidateGeometry = {
  polygon: unknown
  bbox: unknown
  damage_type: string
}

/**
 * True only when the edit changes shape or class. A notes or severity edit
 * leaves the candidate's provenance intact, otherwise "how often was the
 * heuristic right" becomes unanswerable after the first incidental edit.
 */
export function geometryChanged(
  current: CandidateGeometry,
  patch: { polygon?: unknown; bbox?: unknown; damageType?: string }
): boolean {
  if (patch.polygon !== undefined && JSON.stringify(patch.polygon) !== JSON.stringify(current.polygon)) return true
  if (patch.bbox !== undefined && JSON.stringify(patch.bbox) !== JSON.stringify(current.bbox)) return true
  if (patch.damageType !== undefined && patch.damageType !== current.damage_type) return true
  return false
}

export function shouldSnapshotCandidate(
  current: CandidateGeometry & { source: string; original_geometry: unknown },
  patch: { polygon?: unknown; bbox?: unknown; damageType?: string }
): boolean {
  if (current.source !== 'heuristic' && current.source !== 'gemini' && current.source !== 'model') return false
  if (current.original_geometry) return false
  return geometryChanged(current, patch)
}
