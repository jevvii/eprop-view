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
