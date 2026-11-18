'use client'

import { Chip } from '@/components/structural/ui'
import type { InspectionImage } from '@/app/types'

/**
 * Compact capture-condition chips.
 *
 * "Scale unknown" is shown in the warn tone on purpose: it is the one condition
 * that silently limits what the dataset can teach about crack width.
 */
export function CaptureBadge({
  image,
  trainingEligible,
}: {
  image: InspectionImage
  trainingEligible?: boolean
}) {
  const eligible = trainingEligible ?? image.training_eligible

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {image.gsd_mm_per_px ? (
        <Chip tone="info">{image.gsd_mm_per_px.toFixed(2)} mm/px</Chip>
      ) : (
        <Chip tone="warn">scale unknown</Chip>
      )}

      {image.lighting && <Chip>{image.lighting.replace('_', ' ')}</Chip>}
      {image.element_type && <Chip>{image.element_type}</Chip>}
      {!eligible && <Chip tone="bad">not trainable</Chip>}
    </div>
  )
}
