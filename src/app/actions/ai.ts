'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { supportsLocalInference } from '@/app/lib/ai/registry'
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

  const service = createServiceClient()
  const { data: job, error: jobError } = await service.from('ai_analysis_jobs')
    .insert({ image_id: imageId, model_id: model.id, status: 'running', started_at: new Date().toISOString() })
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
    const inferenceResult = await runDetection(downloadedBlob, model)

    // Persist a whole validated run, including no findings, atomically. Other
    // methods and engineering confirmations are independent evidence.
    const { data, error } = await service.rpc('commit_image_analysis', {
      p_image_id: imageId, p_actor_id: userId, p_provenance: 'heuristic',
      p_job_id: job.id, p_model_id: model.id, p_rows: inferenceResult.detections,
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
