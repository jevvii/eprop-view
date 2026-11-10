'use server'

import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { recordAuditEvent } from '@/app/lib/audit'
import {
  GEMINI_DATA_NOTICE,
  GeminiUnavailableError,
  generateStructured,
  isGeminiConfigured,
} from '@/app/lib/ai/gemini'
import { checkDivergence, tableEstimate } from '@/app/lib/structural/cost-table'
import { computeFinalDamageScore, scoreToRiskLevel } from '@/app/lib/damage-score'
import type { AIDamageDetection } from '@/app/types'

/**
 * Gemini-backed analysis actions.
 *
 * These are the ONLY entry points that may call Gemini. The live AR frame path
 * stays on the deterministic heuristic (scope contract §6) so scanning cannot
 * stall and cannot exhaust a ~20 request/day quota.
 */

const MAX_INLINE_IMAGE_BYTES = 6 * 1024 * 1024

// -----------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------

const damageSchema = {
  type: 'OBJECT',
  properties: {
    damage_type: {
      type: 'STRING',
      enum: ['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none'],
    },
    severity: { type: 'STRING', enum: ['low', 'medium', 'high', 'critical'] },
    severity_score: { type: 'NUMBER' },
    confidence: { type: 'NUMBER' },
    summary: { type: 'STRING' },
    crack_width_mm: { type: 'NUMBER', nullable: true },
    crack_orientation: {
      type: 'STRING',
      nullable: true,
      enum: ['vertical', 'horizontal', 'diagonal', 'stepped', 'map_cracking', 'none'],
    },
    crack_pattern: {
      type: 'STRING',
      nullable: true,
      enum: ['single', 'multiple', 'parallel', 'random', 'none'],
    },
    crack_cause: {
      type: 'STRING',
      nullable: true,
      enum: ['settlement', 'shrinkage', 'thermal', 'overload', 'corrosion_induced', 'unknown', 'none'],
    },
    bbox: {
      type: 'OBJECT',
      nullable: true,
      properties: {
        x: { type: 'NUMBER' },
        y: { type: 'NUMBER' },
        width: { type: 'NUMBER' },
        height: { type: 'NUMBER' },
      },
      required: ['x', 'y', 'width', 'height'],
    },
  },
  required: ['damage_type', 'severity', 'severity_score', 'confidence', 'summary'],
} as const

const damageResponseSchema = z.object({
  damage_type: z.enum(['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  severity_score: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  summary: z.string().max(2000),
  crack_width_mm: z.number().min(0).max(1000).nullable().optional(),
  crack_orientation: z
    .enum(['vertical', 'horizontal', 'diagonal', 'stepped', 'map_cracking', 'none'])
    .nullable()
    .optional(),
  crack_pattern: z.enum(['single', 'multiple', 'parallel', 'random', 'none']).nullable().optional(),
  crack_cause: z
    .enum(['settlement', 'shrinkage', 'thermal', 'overload', 'corrosion_induced', 'unknown', 'none'])
    .nullable()
    .optional(),
  bbox: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .nullable()
    .optional(),
})

const costSchema = {
  type: 'OBJECT',
  properties: {
    low_php: { type: 'NUMBER' },
    likely_php: { type: 'NUMBER' },
    high_php: { type: 'NUMBER' },
    basis: { type: 'STRING' },
    confidence: { type: 'NUMBER' },
  },
  required: ['low_php', 'likely_php', 'high_php', 'basis', 'confidence'],
} as const

const costResponseSchema = z.object({
  low_php: z.number().min(0),
  likely_php: z.number().min(0),
  high_php: z.number().min(0),
  basis: z.string().max(2000),
  confidence: z.number().min(0).max(1),
})

const recommendationSchema = {
  type: 'OBJECT',
  properties: {
    action: { type: 'STRING' },
    rationale: { type: 'STRING' },
    urgency: { type: 'STRING', enum: ['routine', 'scheduled', 'urgent', 'immediate'] },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['action', 'rationale', 'urgency', 'steps'],
} as const

const recommendationResponseSchema = z.object({
  action: z.string().max(2000),
  rationale: z.string().max(4000),
  urgency: z.enum(['routine', 'scheduled', 'urgent', 'immediate']),
  steps: z.array(z.string().max(1000)).max(12),
})

const narrativeSchema = {
  type: 'OBJECT',
  properties: { narrative: { type: 'STRING' } },
  required: ['narrative'],
} as const

const narrativeResponseSchema = z.object({
  narrative: z.string().max(20_000),
})

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

export interface GeminiAvailability {
  configured: boolean
  notice: string
}

export async function getGeminiAvailability(): Promise<GeminiAvailability> {
  return { configured: isGeminiConfigured(), notice: GEMINI_DATA_NOTICE }
}

async function readStoredImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storagePath: string
): Promise<{ data: string; mimeType: string; bytes: number }> {
  const { data: blob, error } = await supabase.storage.from('inspection-images').download(storagePath)
  if (error || !blob) {
    throw new Error(`Stored image could not be read: ${error?.message ?? 'object missing'}`)
  }

  const buffer = Buffer.from(await blob.arrayBuffer())
  if (buffer.byteLength > MAX_INLINE_IMAGE_BYTES) {
    throw new Error(
      `Image is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB, above the ${MAX_INLINE_IMAGE_BYTES / 1024 / 1024} MB inline limit.`
    )
  }

  const mimeType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg'

  return { data: buffer.toString('base64'), mimeType, bytes: buffer.byteLength }
}

async function recalculateInspectionRisk(
  supabase: Awaited<ReturnType<typeof createClient>>,
  inspectionId: string
): Promise<void> {
  const { data: images } = await supabase
    .from('inspection_images')
    .select('id')
    .eq('inspection_id', inspectionId)

  if (!images || images.length === 0) return

  const { data: detections } = await supabase
    .from('ai_damage_detections')
    .select('severity_score, provenance')
    .in('image_id', images.map((image) => image.id))

  const usable = (detections || []).filter((row) => row.provenance !== 'legacy_synthetic')
  if (usable.length === 0) return

  const maxScore = Math.max(...usable.map((row) => Number(row.severity_score)))
  const finalScore = computeFinalDamageScore(maxScore, 1.2, 1.0, 1.0)

  await supabase
    .from('inspections')
    .update({
      risk_score: finalScore,
      risk_level: scoreToRiskLevel(finalScore),
      updated_at: new Date().toISOString(),
    })
    .eq('id', inspectionId)
}

/**
 * Fall back to the deterministic heuristic when Gemini is unavailable.
 * Returns the detections it produced so the caller can report what happened.
 */
async function runHeuristicFallback(
  imageId: string,
  inspectionId: string,
  storagePath: string
): Promise<AIDamageDetection[]> {
  const supabase = await createClient()

  const { data: model } = await supabase
    .from('ai_models')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!model) return []

  const { data: blob, error } = await supabase.storage.from('inspection-images').download(storagePath)
  if (error || !blob) throw new Error('Stored image could not be read for fallback analysis.')

  const { runDetection } = await import('@/app/lib/ai/inference-worker')
  const result = await runDetection(blob, model)

  await supabase.from('ai_damage_detections').delete().eq('image_id', imageId).eq('provenance', 'gemini')

  if (result.detections.length === 0) return []

  const { data: inserted, error: insertError } = await supabase
    .from('ai_damage_detections')
    .insert(
      result.detections.map((detection) => ({
        ...detection,
        image_id: imageId,
        model_id: model.id,
        provenance: 'heuristic' as const,
      }))
    )
    .select()

  if (insertError) throw insertError

  await recalculateInspectionRisk(supabase, inspectionId)
  return (inserted || []) as AIDamageDetection[]
}

// -----------------------------------------------------------------
// A2 + C1. Vision classification
// -----------------------------------------------------------------

export interface DeepAnalysisResult {
  provenance: 'gemini' | 'heuristic'
  model: string | null
  detections: AIDamageDetection[]
  summary: string
  fallbackReason?: string
}

export async function analyzeImageWithGemini(imageId: string): Promise<DeepAnalysisResult> {
  const { userId, role } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsedImageId = z.string().uuid().parse(imageId)

  // Deliberate-action budgets: a per-minute guard plus a daily quota that
  // matches the free tier so the demo degrades instead of failing hard.
  await enforceRateLimit(`gemini:minute:${userId}`, 5, 60)
  await enforceRateLimit(`gemini:day:${userId}`, 20, 86_400)

  const supabase = await createClient()
  const { data: image, error: imageError } = await supabase
    .from('inspection_images')
    .select('id, inspection_id, storage_path, inspections(lead_inspector_id)')
    .eq('id', parsedImageId)
    .single()

  if (imageError || !image) throw new Error('Inspection image not found')

  const inspection = image.inspections as { lead_inspector_id?: string } | null
  if (
    role === 'inspector' &&
    inspection?.lead_inspector_id &&
    inspection.lead_inspector_id !== userId
  ) {
    throw new Error('Access denied: inspectors may only analyse their assigned inspections.')
  }

  if (!image.storage_path) throw new Error('This image has no stored file to analyse.')

  const prompt = [
    'You are assisting a licensed civil engineer with a structural condition survey.',
    'Analyse the single photograph and return ONE JSON object.',
    'Classify the dominant visible defect. If nothing is visible, return damage_type "none" with severity "low" and severity_score 0.',
    'severity_score is 0–100 where 0 is no defect and 100 is imminent structural failure.',
    'confidence is 0–1 and must reflect how clearly the defect is visible.',
    'Only populate the crack_* fields when damage_type is "crack". crack_width_mm is your visual estimate in millimetres; if you cannot estimate it, return null rather than guessing.',
    'bbox is a normalised bounding box (0–1) around the defect, or null.',
    'summary is one or two sentences an engineer can paste into a report.',
  ].join(' ')

  let result: DeepAnalysisResult

  try {
    const imagePayload = await readStoredImage(supabase, image.storage_path)

    const { value, model } = await generateStructured({
      prompt,
      image: { data: imagePayload.data, mimeType: imagePayload.mimeType },
      schema: damageSchema as unknown as Record<string, unknown>,
      parse: (raw) => damageResponseSchema.parse(raw),
    })

    // Replace only previous Gemini rows: heuristic results remain as an
    // independent second opinion for the engineer to compare against.
    await supabase
      .from('ai_damage_detections')
      .delete()
      .eq('image_id', parsedImageId)
      .eq('provenance', 'gemini')

    if (value.damage_type === 'none') {
      result = { provenance: 'gemini', model, detections: [], summary: value.summary }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('ai_damage_detections')
        .insert({
          image_id: parsedImageId,
          model_id: null,
          damage_type: value.damage_type,
          severity: value.severity,
          severity_score: value.severity_score,
          confidence: value.confidence,
          bbox: value.bbox ?? null,
          provenance: 'gemini',
          notes: value.summary,
          crack_width_mm: value.crack_width_mm ?? null,
          crack_orientation: value.crack_orientation ?? null,
          crack_pattern: value.crack_pattern ?? null,
          crack_cause: value.crack_cause ?? null,
          aci_reference: value.crack_width_mm != null ? 'ACI 224R-01 §4.1' : null,
        })
        .select()

      if (insertError) throw insertError

      result = {
        provenance: 'gemini',
        model,
        detections: (inserted || []) as AIDamageDetection[],
        summary: value.summary,
      }
    }
  } catch (error) {
    const unavailable = error instanceof GeminiUnavailableError
    if (!unavailable || error.code === 'invalid_response') {
      // A malformed response is a real defect, not a quota problem. Surface it.
      throw error
    }

    const detections = await runHeuristicFallback(parsedImageId, image.inspection_id, image.storage_path)
    result = {
      provenance: 'heuristic',
      model: null,
      detections,
      summary: 'Gemini was unavailable, so the deterministic heuristic produced this result.',
      fallbackReason: error.message,
    }
  }

  await recalculateInspectionRisk(supabase, image.inspection_id)

  await recordAuditEvent({
    action: 'ai.deep_analysis',
    entityType: 'inspection_image',
    entityId: parsedImageId,
    after: {
      provenance: result.provenance,
      model: result.model,
      detections: result.detections.length,
      fallback: result.fallbackReason ?? null,
    },
  })

  return result
}

// -----------------------------------------------------------------
// A6. Cost suggestion (never persisted here)
// -----------------------------------------------------------------

export interface CostSuggestion {
  aiLowPhp: number | null
  aiLikelyPhp: number | null
  aiHighPhp: number | null
  basis: string
  confidence: number
  tableEstimatePhp: number
  divergenceFlag: boolean
  divergenceReason: string
  model: string | null
  fallbackReason?: string
}

const costInputSchema = z
  .object({
    damageType: z.enum(['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    elementType: z
      .enum(['beam', 'column', 'slab', 'wall', 'foundation', 'facade', 'roof', 'general', 'other'])
      .default('general'),
    context: z.string().max(2000).default(''),
  })
  .strict()

export async function suggestRepairCost(
  input: z.input<typeof costInputSchema>
): Promise<CostSuggestion> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = costInputSchema.parse(input)

  await enforceRateLimit(`gemini:minute:${userId}`, 5, 60)
  await enforceRateLimit(`gemini:day:${userId}`, 20, 86_400)

  const tableView = tableEstimate(parsed.damageType, parsed.severity, parsed.elementType)

  try {
    const { value, model } = await generateStructured({
      prompt: [
        'You are assisting a Philippine civil engineering firm with planning-level repair budgeting.',
        `Defect: ${parsed.damageType}, severity ${parsed.severity}, structural element ${parsed.elementType}.`,
        parsed.context ? `Site context: ${parsed.context}.` : '',
        'Return a planning-level repair cost range in Philippine pesos for a single defect.',
        'low_php is a best-case repair, likely_php the expected cost, high_php a worst case needing replacement.',
        'basis must state the assumptions in one or two sentences. confidence is 0–1.',
      ]
        .filter(Boolean)
        .join(' '),
      schema: costSchema as unknown as Record<string, unknown>,
      parse: (raw) => costResponseSchema.parse(raw),
    })

    const divergence = checkDivergence(value.likely_php, tableView)

    return {
      aiLowPhp: value.low_php,
      aiLikelyPhp: value.likely_php,
      aiHighPhp: value.high_php,
      basis: value.basis,
      confidence: value.confidence,
      tableEstimatePhp: tableView,
      divergenceFlag: divergence.divergent,
      divergenceReason: divergence.reason,
      model,
    }
  } catch (error) {
    if (!(error instanceof GeminiUnavailableError) || error.code === 'invalid_response') throw error

    return {
      aiLowPhp: null,
      aiLikelyPhp: null,
      aiHighPhp: null,
      basis: 'AI estimate unavailable; the planning table is shown instead.',
      confidence: 0,
      tableEstimatePhp: tableView,
      divergenceFlag: false,
      divergenceReason: 'No AI estimate to compare.',
      model: null,
      fallbackReason: error.message,
    }
  }
}

// -----------------------------------------------------------------
// C2. Recommendation and narrative drafting
// -----------------------------------------------------------------

export interface RecommendationDraft {
  action: string
  rationale: string
  urgency: 'routine' | 'scheduled' | 'urgent' | 'immediate'
  steps: string[]
  model: string | null
  fallbackReason?: string
}

const draftInputSchema = z
  .object({
    damageType: z.enum(['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    elementType: z.string().max(80).default('general'),
    context: z.string().max(4000).default(''),
  })
  .strict()

export async function draftRecommendation(
  input: z.input<typeof draftInputSchema>
): Promise<RecommendationDraft> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = draftInputSchema.parse(input)

  await enforceRateLimit(`gemini:minute:${userId}`, 5, 60)
  await enforceRateLimit(`gemini:day:${userId}`, 20, 86_400)

  try {
    const { value, model } = await generateStructured({
      prompt: [
        'You are drafting a maintenance recommendation for a licensed engineer to review and sign.',
        `Defect: ${parsed.damageType}, severity ${parsed.severity}, element ${parsed.elementType}.`,
        parsed.context ? `Findings: ${parsed.context}.` : '',
        'Return one JSON object. action is a single imperative sentence.',
        'rationale explains why, referencing the defect and element. urgency is routine, scheduled, urgent or immediate.',
        'steps are concrete, ordered repair steps an engineer can approve.',
        'Do not claim certainty you do not have. This will be human-reviewed before it reaches a report.',
      ]
        .filter(Boolean)
        .join(' '),
      schema: recommendationSchema as unknown as Record<string, unknown>,
      parse: (raw) => recommendationResponseSchema.parse(raw),
    })

    return { ...value, model }
  } catch (error) {
    if (!(error instanceof GeminiUnavailableError) || error.code === 'invalid_response') throw error

    return {
      action: 'Engineer review required — AI drafting unavailable.',
      rationale: `Gemini was unavailable (${error.message}). Draft the recommendation manually.`,
      urgency: parsed.severity === 'critical' || parsed.severity === 'high' ? 'urgent' : 'scheduled',
      steps: [],
      model: null,
      fallbackReason: error.message,
    }
  }
}

const narrativeInputSchema = z
  .object({
    title: z.string().min(1).max(300),
    riskScore: z.number().min(0).max(10),
    riskLevel: z.enum(['low', 'moderate', 'high', 'critical']),
    findings: z.string().max(20_000).default(''),
    detections: z
      .array(
        z.object({
          damageType: z.string().max(80),
          severity: z.string().max(40),
          notes: z.string().max(2000).optional(),
        })
      )
      .max(50)
      .default([]),
  })
  .strict()

export async function draftReportNarrative(
  input: z.input<typeof narrativeInputSchema>
): Promise<{ narrative: string; model: string | null; fallbackReason?: string }> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = narrativeInputSchema.parse(input)

  await enforceRateLimit(`gemini:minute:${userId}`, 5, 60)
  await enforceRateLimit(`gemini:day:${userId}`, 20, 86_400)

  const detectionLines = parsed.detections
    .map((detection) => `- ${detection.damageType} (${detection.severity})${detection.notes ? `: ${detection.notes}` : ''}`)
    .join('\n')

  try {
    const { value, model } = await generateStructured({
      prompt: [
        'Write the key findings narrative for a structural inspection report.',
        `Report title: ${parsed.title}.`,
        `Computed risk score: ${parsed.riskScore.toFixed(1)}/10 (${parsed.riskLevel}).`,
        parsed.findings ? `Engineer notes: ${parsed.findings}.` : '',
        detectionLines ? `Detected defects:\n${detectionLines}` : 'No defects were detected.',
        'Write 2–4 plain paragraphs for a professional engineering report. Do not invent measurements, dates, or defect counts beyond those given.',
      ]
        .filter(Boolean)
        .join('\n'),
      schema: narrativeSchema as unknown as Record<string, unknown>,
      parse: (raw) => narrativeResponseSchema.parse(raw),
      temperature: 0.4,
    })

    return { narrative: value.narrative, model }
  } catch (error) {
    if (!(error instanceof GeminiUnavailableError) || error.code === 'invalid_response') throw error

    const fallback = [
      `Inspection recorded a risk score of ${parsed.riskScore.toFixed(1)}/10 (${parsed.riskLevel}).`,
      parsed.findings ? `Engineer notes: ${parsed.findings}` : '',
      parsed.detections.length > 0
        ? `Detected defects: ${parsed.detections.map((d) => `${d.damageType} (${d.severity})`).join(', ')}.`
        : 'No defects were detected in the processed imagery.',
      'This narrative was assembled deterministically because the AI drafting service was unavailable.',
    ]
      .filter(Boolean)
      .join(' ')

    return { narrative: fallback, model: null, fallbackReason: error.message }
  }
}
