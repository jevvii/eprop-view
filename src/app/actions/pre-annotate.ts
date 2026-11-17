'use server'

import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { recordAuditEvent } from '@/app/lib/audit'
import { actionOk, actionRefuse, type ActionResult } from '@/app/lib/action-result'
import { runDetection } from '@/app/lib/ai/inference-worker'
import { isPlausibleBbox, mapDetectionToCandidate } from '@/app/lib/annotation/mapping'
import type { AIModel } from '@/app/types'

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
  labels: ['crack', 'corrosion', 'spalling'],
  is_active: true,
  created_at: new Date(0).toISOString(),
}

export async function preAnnotateImage(imageId: string, firstVisit = false): Promise<ActionResult<{ created: number }>> {
  const { userId, role } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = z.string().uuid().safeParse(imageId)
  if (!parsed.success) return actionRefuse('Invalid image id.')
  await enforceRateLimit(`annotate:${userId}`, 120, 3600)

  const supabase = await createClient()
  const { data: image, error: imageError } = await supabase
    .from('inspection_images')
    .select('id, uploader_id, annotation_suggested_at, storage_path, storage_bucket')
    .eq('id', imageId)
    .maybeSingle()

  if (imageError) throw imageError
  if (!image) return actionRefuse('The image no longer exists.')

  if (role === 'inspector' && image.uploader_id !== userId) return actionRefuse('Inspectors may only annotate their own captures.')

  if (firstVisit && image.annotation_suggested_at) return actionOk({ created: 0 })

  const bucket = image.storage_bucket || 'inspection-images'
  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(image.storage_path)
  if (downloadError || !blob) return actionRefuse('The stored image could not be read.')

  let detections
  try {
    // The heuristic is an 8×8 grid over a normalised tensor; running it at the
    // stored resolution buys nothing and allocates hundreds of MB in a request.
    const result = await runDetection(blob, HEURISTIC_MODEL)
    detections = result.detections
  } catch (error) {
    console.error('Heuristic pre-annotation failed:', error)
    return actionRefuse('The heuristic could not analyse this image.')
  }

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
        damage_type: candidate.damageType,
        severity: candidate.severity,
        severity_score: detection.severity_score,
        bbox: candidate.bbox,
        source_confidence: candidate.sourceConfidence,
      },
    ]
  })

  const { data: created, error } = await supabase.rpc('replace_annotation_candidates', {
    p_image_id: imageId, p_rows: rows, p_first_visit: firstVisit,
  })
  if (error) return actionRefuse('Suggestions could not be saved. Your existing drafts are still available.')
  await recordAuditEvent({
    action: 'annotation.pre_annotate', entityType: 'inspection_image', entityId: imageId,
    metadata: { created, actor: userId },
  })
  return actionOk({ created: created as number })
}
