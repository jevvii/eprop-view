'use server'

import sharp from 'sharp'
import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { runDetection } from '@/app/lib/ai/inference-worker'
import type { AIModel, DamageType, SeverityLevel } from '@/app/types'

const MAX_FRAME_BYTES = 8 * 1024 * 1024

const frameSchema = z
  .object({
    inspectionId: z.string().uuid(),
    dataUrl: z
      .string()
      .regex(/^data:image\/[a-z+.-]+;base64,/i, 'Expected a base64 image data URL')
      .max(12_000_000),
  })
  .strict()

export interface FrameAnalysis {
  damageType: DamageType
  severity: SeverityLevel
  severityScore: number
  confidence: number
  latencyMs: number
  engine: 'heuristic'
}

/**
 * Analyzes a captured AR frame with the same heuristic used for stored images.
 * Returns null when the frame does not trip any threshold — that is a real
 * result, not a failure, and it is never replaced with a fabricated finding.
 */
export async function analyzeCapturedFrame(input: unknown): Promise<FrameAnalysis | null> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  await enforceRateLimit(`ai-frame:${userId}`, 30, 3600)

  const parsed = frameSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid frame payload')
  }

  const supabase = await createClient()

  const { data: inspection, error: inspectionError } = await supabase
    .from('inspections')
    .select('id, lead_inspector_id')
    .eq('id', parsed.data.inspectionId)
    .maybeSingle()

  if (inspectionError || !inspection) {
    throw new Error('Inspection record not found')
  }

  if (role === 'inspector' && inspection.lead_inspector_id && inspection.lead_inspector_id !== userId) {
    throw new Error('Access denied: inspectors may only analyze their assigned inspections')
  }

  const base64 = parsed.data.dataUrl.slice(parsed.data.dataUrl.indexOf(',') + 1)
  const buffer = Buffer.from(base64, 'base64')

  if (buffer.byteLength === 0 || buffer.byteLength > MAX_FRAME_BYTES) {
    throw new Error('Captured frame is empty or exceeds 8 MB')
  }

  // Verify the bytes are a real image before running any analysis.
  await sharp(buffer).metadata()

  const { data: models, error: modelError } = await supabase
    .from('ai_models')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (modelError) throw modelError
  if (!models || models.length === 0) {
    throw new Error('No active analysis model is configured')
  }

  const result = await runDetection(buffer, models[0] as AIModel)
  const top = result.detections[0]

  if (!top || !top.bbox) {
    return null
  }

  return {
    damageType: top.damage_type,
    severity: top.severity,
    severityScore: top.severity_score,
    confidence: top.confidence,
    latencyMs: result.latencyMs,
    engine: 'heuristic',
  }
}
