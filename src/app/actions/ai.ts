'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { supportsLocalInference } from '@/app/lib/ai/registry'
import type { TrainedInferenceResult } from '@/app/lib/ai/onnx-detector'
import { z } from 'zod'
import { createServiceClient } from '@/app/lib/supabase/service'
import { resolveEvidenceLocation } from '@/app/lib/storage-location'
import type {
  AIModel,
  AIDamageDetection,
  AIAnalysisJob,
  DamageType,
  SeverityLevel,
} from '@/app/types'

/**
 * Return active AI models. If none are active, return an empty list: the UI
 * must not silently select an inactive model and then fail at run time.
 */
export async function getActiveAIModels(): Promise<AIModel[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .eq('is_active', true)
    .eq('format', 'heuristic')
    .eq('task', 'detection')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as AIModel[]
}

/**
 * Which crack method a saved-photo analysis will actually use, for display.
 * Never selects a model: the run action re-resolves the pinned artifact.
 */
export async function getTrainedDetectorStatus(): Promise<{
  enabled: boolean
  flag: 'on' | 'off' | 'blocked-production'
  model: AIModel | null
}> {
  const { trainedCrackDetectorEnabled, trainedCrackDetectorFlagState } = await import('@/app/lib/ai/flags')
  const { isTrainedCrackDetector } = await import('@/app/lib/ai/registry')
  const flag = trainedCrackDetectorFlagState()
  if (!trainedCrackDetectorEnabled()) return { enabled: false, flag, model: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .eq('is_active', true)
    .eq('format', 'onnx')
    .eq('task', 'detection')
    .limit(10)
  if (error) throw error
  const model = ((data ?? []) as AIModel[]).find(isTrainedCrackDetector) ?? null
  return { enabled: Boolean(model), flag, model }
}

/**
 * Return detections for a specific inspection image.
 */
export async function getDetectionsForImage(imageId: string): Promise<AIDamageDetection[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_damage_detections')
    .select('*')
    .eq('image_id', imageId)
    .order('confidence', { ascending: false })

  if (error) throw error
  return (data || []) as AIDamageDetection[]
}

/**
 * Return analysis jobs for a specific inspection image.
 */
export async function getAnalysisJobsForImage(imageId: string): Promise<AIAnalysisJob[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_analysis_jobs')
    .select('*')
    .eq('image_id', imageId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as AIAnalysisJob[]
}

/**
 * Run AI analysis on an inspection image. Validates model, cleans up previous
 * detections on re-runs, persists new detections, and updates parent inspection risk.
 *
 * With the Preview flag on, a saved photo is analyzed by the project-trained
 * crack detector (including a legitimate empty result) plus the heuristic's
 * corrosion/spalling suggestions. Any load, checksum, timeout or inference
 * failure falls back to the complete heuristic, and the job records which
 * method actually ran and why.
 */
export async function runAIAnalysis(
  imageId: string,
  modelId?: string
): Promise<{ job: AIAnalysisJob; detections: AIDamageDetection[] }> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  await enforceRateLimit(`ai-analysis:${userId}`, 20, 3600)
  const supabase = await createClient()

  if (!z.string().uuid().safeParse(imageId).success) {
    throw new Error('Invalid image id')
  }

  // Verify image exists and (if inspector) belongs to inspection owned by inspector
  const { data: img, error: imgError } = await supabase
    .from('inspection_images')
    .select('id, inspection_id, storage_path, storage_bucket, inspections(lead_inspector_id)')
    .eq('id', imageId)
    .single()

  if (imgError || !img) {
    throw new Error(`Target inspection image '${imageId}' not found.`)
  }

  const parentInspection = img.inspections as { lead_inspector_id?: string } | null
  if (role === 'inspector' && parentInspection?.lead_inspector_id !== userId) {
    throw new Error('Access denied: inspectors may only trigger AI inference on their assigned inspections.')
  }

  let query = supabase.from('ai_models').select('*').eq('is_active', true)
    .eq('format', 'heuristic').eq('task', 'detection')
  if (modelId !== undefined) query = query.eq('id', z.string().uuid().parse(modelId))
  const { data: model, error: modelError } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (modelError) throw modelError
  if (!model || !supportsLocalInference(model)) throw new Error('No active heuristic detector is available.')

  // The trained detector is selected by its pinned artifact identity, never by
  // whichever `onnx` row happens to exist.
  const { trainedCrackDetectorEnabled, trainedCrackDetectorFlagState } = await import('@/app/lib/ai/flags')
  const { isTrainedCrackDetector } = await import('@/app/lib/ai/registry')
  const flagState = trainedCrackDetectorFlagState()
  let trainedModel: AIModel | null = null
  if (trainedCrackDetectorEnabled() && modelId === undefined) {
    const { data: onnxRows, error: onnxError } = await supabase
      .from('ai_models').select('*').eq('is_active', true).eq('format', 'onnx').eq('task', 'detection')
      .order('created_at', { ascending: false }).limit(10)
    if (onnxError) throw onnxError
    trainedModel = ((onnxRows ?? []) as AIModel[]).find(isTrainedCrackDetector) ?? null
  }

  const service = createServiceClient()
  const intendedMethod: 'model' | 'heuristic' = trainedModel ? 'model' : 'heuristic'
  const { data: job, error: jobError } = await service.from('ai_analysis_jobs')
    .insert({
      image_id: imageId,
      model_id: (trainedModel ?? model).id,
      method: intendedMethod,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select().single()
  if (jobError || !job) throw jobError ?? new Error('Failed to start analysis')

  try {
    if (!img.storage_path) {
      throw new Error('This image has no stored file to analyze.')
    }

    const location = resolveEvidenceLocation(img)
    const { data: downloadedBlob, error: downloadError } = await supabase.storage
      .from(location.bucket)
      .download(location.path)

    if (downloadError || !downloadedBlob) {
      throw new Error(`Stored image could not be read: ${downloadError?.message ?? 'object missing'}`)
    }

    const { runDetection } = await import('@/app/lib/ai/inference-worker')

    let trained: TrainedInferenceResult | null = null
    let trainedFailure: string | null = null
    if (trainedModel) {
      try {
        const { runTrainedDetection } = await import('@/app/lib/ai/onnx-detector')
        trained = await runTrainedDetection(downloadedBlob, trainedModel)
      } catch (error) {
        trainedFailure = error instanceof Error ? error.message : 'Trained detector failed'
      }
    }

    if (trained && trainedModel) {
      // The trained model owns crack evidence; the heuristic still supplies the
      // defect classes it is not trained on. A heuristic failure must not throw
      // away a valid trained result.
      let others: typeof trained.detections = []
      let heuristicFailure: string | null = null
      let heuristicLatency: number | null = null
      try {
        const heuristic = await runDetection(downloadedBlob, model)
        heuristicLatency = heuristic.latencyMs
        others = heuristic.detections.filter((d) => d.damage_type !== 'crack')
      } catch (error) {
        heuristicFailure = error instanceof Error ? error.message : 'Heuristic fallback failed'
      }

      const rows = [
        ...trained.detections.map((d) => ({ ...d, provenance: 'model' as const })),
        ...others.map((d) => ({ ...d, provenance: 'heuristic' as const })),
      ]
      const detail = {
        primary: 'model',
        flag: flagState,
        artifact_sha256: trained.artifactSha256,
        crack_count: trained.crackCount,
        other_count: rows.length - trained.crackCount,
        trained_latency_ms: trained.latencyMs,
        ...(heuristicLatency === null ? {} : { heuristic_latency_ms: heuristicLatency }),
        ...(heuristicFailure ? { heuristic_failure: heuristicFailure } : {}),
      }
      const { data, error } = await service.rpc('commit_image_analysis_v2', {
        p_image_id: imageId, p_actor_id: userId, p_method: 'model',
        p_model_id: trainedModel.id, p_rows: rows, p_job_id: job.id, p_method_detail: detail,
      })
      if (error) throw error
      return data as { job: AIAnalysisJob; detections: AIDamageDetection[] }
    }

    // Fallback: the complete heuristic, identified as the method that ran.
    const fallbackReason = trainedFailure
      ?? (flagState !== 'on'
        ? 'Trained detector flag is off.'
        : modelId !== undefined
          ? 'A specific heuristic model was requested for this run.'
          : 'No active trained detector is registered.')
    if (trainedModel) {
      await service.from('ai_analysis_jobs')
        .update({
          method: 'heuristic', model_id: model.id,
          method_detail: { primary: 'heuristic', flag: flagState, fallback_reason: fallbackReason },
        })
        .eq('id', job.id).eq('status', 'running')
    }
    const heuristic = await runDetection(downloadedBlob, model)
    const detail = {
      primary: 'heuristic', flag: flagState,
      fallback_reason: fallbackReason,
      env_debug: {
        flag_length: (process.env.TRAINED_CRACK_DETECTOR ?? '').length,
        flag_equals_on: (process.env.TRAINED_CRACK_DETECTOR ?? '').trim().toLowerCase() === 'on',
        vercel_env: process.env.VERCEL_ENV ?? null,
      },

      heuristic_latency_ms: heuristic.latencyMs,
      other_count: heuristic.detections.length,
    }
    const { data, error } = await service.rpc('commit_image_analysis_v2', {
      p_image_id: imageId, p_actor_id: userId, p_method: 'heuristic',
      p_model_id: model.id,
      p_rows: heuristic.detections.map((d) => ({ ...d, provenance: 'heuristic' as const })),
      p_job_id: job.id, p_method_detail: detail,
    })
    if (error) throw error
    return data as { job: AIAnalysisJob; detections: AIDamageDetection[] }
  } catch (error) {
    await service
      .from('ai_analysis_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown inference error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('status', 'running')

    throw error
  }
}

/**
 * Verify or override an AI detection. If verified with high or critical severity,
 * auto-creates a maintenance_priorities ticket for engineering attention.
 */
export async function verifyDetection(
  detectionId: string,
  approved: boolean,
  notes?: string
): Promise<AIDamageDetection> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const supabase = await createClient()

  if (!z.string().uuid().safeParse(detectionId).success) {
    throw new Error('Invalid detection id')
  }
  z.boolean().parse(approved)
  const safeNotes = notes ? z.string().max(2000).parse(notes) : ''

  const updates: Record<string, unknown> = {
    ...(notes === undefined ? {} : { notes: safeNotes }),
    is_rejected: !approved,
  }

  if (approved) {
    updates.verified_by = userId
    updates.verified_at = new Date().toISOString()
  } else {
    updates.verified_by = null
    updates.verified_at = null
  }

  const { data: updatedDetection, error } = await supabase
    .from('ai_damage_detections')
    .update(updates)
    .eq('id', detectionId)
    .select()
    .single()

  if (error || !updatedDetection) throw error ?? new Error('Failed to update detection')

  return updatedDetection as AIDamageDetection
}

/**
 * Adjust or edit AI detection parameters (Inspector Confirm/Edit & Engineer Validate/Adjust).
 * Updates damage type, severity, score, bbox, and notes, and recalculates parent inspection risk.
 */
const detectionUpdateSchema = z
  .object({
    damage_type: z.enum(['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    severity_score: z.number().min(0).max(100).optional(),
    confidence: z.number().min(0).max(1).optional(),
    notes: z.string().max(2000).optional(),
    approved: z.boolean().optional(),
  })
  .strict()

export async function updateAIDetection(
  detectionId: string,
  params: {
    damage_type?: DamageType
    severity?: SeverityLevel
    severity_score?: number
    confidence?: number
    notes?: string
    approved?: boolean
  }
): Promise<AIDamageDetection> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const supabase = await createClient()

  if (!z.string().uuid().safeParse(detectionId).success) {
    throw new Error('Invalid detection id')
  }

  const parsed = detectionUpdateSchema.safeParse(params)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid detection update')
  }
  const input = parsed.data

  const updates: Record<string, unknown> = {}
  if (input.damage_type !== undefined) updates.damage_type = input.damage_type
  if (input.severity !== undefined) updates.severity = input.severity
  if (input.severity_score !== undefined) updates.severity_score = input.severity_score
  if (input.confidence !== undefined) updates.confidence = input.confidence
  if (input.notes !== undefined) updates.notes = input.notes

  if (input.approved !== undefined) updates.is_rejected = !input.approved
  if (input.approved === true) {
    updates.verified_by = userId
    updates.verified_at = new Date().toISOString()
  } else if (input.approved === false) {
    updates.verified_by = null
    updates.verified_at = null
  }

  const { data: updatedDetection, error } = await supabase
    .from('ai_damage_detections')
    .update(updates)
    .eq('id', detectionId)
    .select()
    .single()

  if (error || !updatedDetection) throw error ?? new Error('Failed to update AI detection')

  return updatedDetection as AIDamageDetection
}

/**
 * Return all AI detections for all images linked to an inspection.
 */
export async function getDetectionsForInspection(inspectionId: string): Promise<AIDamageDetection[]> {
  const supabase = await createClient()
  const { data: images, error: imagesError } = await supabase
    .from('inspection_images')
    .select('id')
    .eq('inspection_id', inspectionId)

  if (imagesError) throw imagesError
  if (!images || images.length === 0) return []

  const imageIds = images.map((img) => img.id)
  const { data, error } = await supabase
    .from('ai_damage_detections')
    .select('*')
    .in('image_id', imageIds)
    .eq('is_rejected', false)
    .not('provenance', 'in', '(synthetic,legacy_synthetic)')
    .order('confidence', { ascending: false })

  if (error) throw error
  return (data || []) as AIDamageDetection[]
}

/**
 * Return all AI detections across all inspections (optionally filtered by project).
 */
export async function getAllAIDetections(projectId?: string, filters?: import('@/app/lib/workspace-filters').WorkspaceFilters): Promise<AIDamageDetection[]> {
  const supabase = await createClient()
  if(filters){
    const {getFilteredRecordIds}=await import('./filters')
    const ids=await getFilteredRecordIds('inspections',filters)
    if(!ids.length)return []
    let query=supabase.from('ai_damage_detections').select('*, inspection_images!inner(inspection_id,inspections!inner(project_id))').in('inspection_images.inspection_id',ids)
      .eq('is_rejected', false).not('provenance', 'in', '(synthetic,legacy_synthetic)')
    if(projectId)query=query.eq('inspection_images.inspections.project_id',projectId)
    const {data,error}=await query.order('created_at',{ascending:false}).limit(500)
    if(error)throw error
    return (data??[]) as AIDamageDetection[]
  }


  if (projectId) {
    const { data: inspections } = await supabase
      .from('inspections')
      .select('id')
      .eq('project_id', projectId)

    if (!inspections || inspections.length === 0) return []
    const inspectionIds = inspections.map((i) => i.id)

    const { data: images } = await supabase
      .from('inspection_images')
      .select('id')
      .in('inspection_id', inspectionIds)

    if (!images || images.length === 0) return []
    const imageIds = images.map((img) => img.id)

    const { data, error } = await supabase
      .from('ai_damage_detections')
      .select('*')
      .in('image_id', imageIds)
    .eq('is_rejected', false)
    .not('provenance', 'in', '(synthetic,legacy_synthetic)')
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as AIDamageDetection[]
  }

  const { data, error } = await supabase
    .from('ai_damage_detections')
    .select('*')
    .order('created_at', { ascending: false })
    .eq('is_rejected', false)
    .not('provenance', 'in', '(synthetic,legacy_synthetic)')
    .limit(100)

  if (error) throw error
  return (data || []) as AIDamageDetection[]
}
