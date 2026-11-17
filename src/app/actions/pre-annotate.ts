'use server'

import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { recordAuditEvent } from '@/app/lib/audit'
import { actionOk, actionRefuse, type ActionResult } from '@/app/lib/action-result'
import { runDetection } from '@/app/lib/ai/inference-worker'
import { isPlausibleBbox, mapDetectionToCandidate } from '@/app/lib/annotation/mapping'
import { severityToScore } from '@/app/lib/damage-score'
import type { AIModel, ImageAnnotation } from '@/app/types'

/**
 * Model-assisted annotation.
 *
 * The heuristic proposes boxes as *drafts*; the engineer corrects them. Nothing
 * is written to ai_damage_detections — candidates and model output stay in
 * separate tables with separate lifecycles.
 */

const HEURISTIC_MODEL: AIModel = {
  id: '00000000-0000-4000-8000-000000000000',
  name: 'Structural heuristic',
  version: '1',
  task: 'detection',
  format: 'heuristic',
  storage_path: null,
  labels: ['crack', 'corrosion', 'spalling', 'deformation', 'leakage'],
  is_active: true,
  created_at: new Date(0).toISOString(),
}

export async function preAnnotateImage(imageId: string): Promise<ActionResult<{ created: number }>> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = z.string().uuid().safeParse(imageId)
  if (!parsed.success) return actionRefuse('Invalid image id.')
  await enforceRateLimit(`annotate:${userId}`, 120, 3600)

  const supabase = await createClient()
  const { data: image, error: imageError } = await supabase
    .from('inspection_images')
    .select('id, inspection_id, storage_path, storage_bucket, width_px, height_px')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) throw imageError
  if (!image) return actionRefuse('The image no longer exists.')

  const bucket = image.storage_bucket || 'inspection-images'
  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(image.storage_path)
  if (downloadError || !blob) return actionRefuse('The stored image could not be read.')

  const bytes = new Uint8Array(await blob.arrayBuffer())

  let detections
  try {
    // The heuristic is an 8×8 grid over a normalised tensor; running it at the
    // stored resolution buys nothing and allocates hundreds of MB in a request.
    const result = await runDetection(bytes, HEURISTIC_MODEL)
    detections = result.detections
  } catch (error) {
    console.error('Heuristic pre-annotation failed:', error)
    return actionRefuse('The heuristic could not analyse this image.')
  }

  // Replace only our own untouched candidates. Manual work and reviewed rows stay.
  const { error: clearError } = await supabase
    .from('image_annotations')
    .delete()
    .eq('image_id', imageId)
    .eq('status', 'draft')
    .eq('source', 'heuristic')

  if (clearError) return actionRefuse(clearError.message)

  const rows = detections.flatMap((detection) => {
    if (!isPlausibleBbox(detection.bbox)) return []
    let candidate
    try {
      candidate = mapDetectionToCandidate(detection)
    } catch {
      return []
    }
    return [
      {
        image_id: imageId,
        damage_type: candidate.damageType,
        severity: candidate.severity,
        severity_score: severityToScore(candidate.severity),
        geometry_kind: 'box' as const,
        bbox: candidate.bbox,
        source: 'heuristic' as const,
        source_confidence: candidate.sourceConfidence,
        status: 'draft' as const,
        notes: '',
        created_by: userId,
      },
    ]
  })

  if (rows.length === 0) {
    await recordAuditEvent({
      action: 'annotation.pre_annotate',
      entityType: 'inspection_image',
      entityId: imageId,
      metadata: { created: 0, actor: userId },
    })
    return actionOk({ created: 0 })
  }

  const { data: inserted, error: insertError } = await supabase
    .from('image_annotations')
    .insert(rows)
    .select()

  if (insertError) return actionRefuse(insertError.message)

  await recordAuditEvent({
    action: 'annotation.pre_annotate',
    entityType: 'inspection_image',
    entityId: imageId,
    metadata: { created: (inserted as ImageAnnotation[] | null)?.length ?? 0, actor: userId },
  })

  return actionOk({ created: (inserted as ImageAnnotation[] | null)?.length ?? 0 })
}
