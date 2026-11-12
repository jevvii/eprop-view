'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { computeFinalDamageScore, scoreToRiskLevel } from '@/app/lib/damage-score'
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
 * Recalculate parent inspection risk score and risk level from AI detections.
 */
async function updateInspectionRiskFromAI(
  supabase: Awaited<ReturnType<typeof createClient>>,
  imageId: string
) {
  try {
    const { data: img } = await supabase
      .from('inspection_images')
      .select('inspection_id')
      .eq('id', imageId)
      .single()

    if (!img?.inspection_id) return

    const { data: siblingImages } = await supabase
      .from('inspection_images')
      .select('id')
      .eq('inspection_id', img.inspection_id)

    if (!siblingImages || siblingImages.length === 0) return
    const imageIds = siblingImages.map((s) => s.id)

    const { data: detectionsForRisk } = await supabase
      .from('ai_damage_detections')
      .select('severity_score, severity, provenance')
      .in('image_id', imageIds)

    const usable = (detectionsForRisk || []).filter((d) => d.provenance !== 'legacy_synthetic')
    if (usable.length > 0) {
      const maxScore = Math.max(...usable.map((d) => d.severity_score))
      const finalScore = computeFinalDamageScore(maxScore, 1.2, 1.0, 1.0)
      const riskLevel = scoreToRiskLevel(finalScore)

      await supabase
        .from('inspections')
        .update({
          risk_score: finalScore,
          risk_level: riskLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', img.inspection_id)
    }
  } catch (err) {
    console.error('Failed to update inspection risk score from AI:', err)
    throw err
  }
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
  if (role === 'inspector' && parentInspection?.lead_inspector_id && parentInspection.lead_inspector_id !== userId) {
    throw new Error('Access denied: inspectors may only trigger AI inference on their assigned inspections.')
  }

  // 1. Validate requested or fallback model
  let resolvedModelId: string | null = null
  if (modelId) {
    const { data: specifiedModel, error: modelError } = await supabase
      .from('ai_models')
      .select('id, is_active')
      .eq('id', modelId)
      .single()

    if (modelError || !specifiedModel) {
      throw new Error(`Requested AI Model '${modelId}' not found.`)
    }
    if (!specifiedModel.is_active) {
      throw new Error(`Requested AI Model '${modelId}' is inactive.`)
    }
    resolvedModelId = specifiedModel.id
  } else {
    const { data: activeModels } = await supabase
      .from('ai_models')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!activeModels || activeModels.length === 0) {
      throw new Error('No active AI model found for inference. Please activate a model in settings.')
    }
    resolvedModelId = activeModels[0].id
  }

  // 2. Create job row
  const { data: job, error: jobError } = await supabase
    .from('ai_analysis_jobs')
    .insert({
      image_id: imageId,
      model_id: resolvedModelId,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (jobError || !job) {
    throw jobError ?? new Error('Failed to create AI analysis job')
  }

  try {
    // 3. Resolve the model from the registry. No synthetic default: if the row
    //    is missing, fail rather than pretend a checkpoint exists.
    const { data: modelData, error: modelReadError } = await supabase
      .from('ai_models')
      .select('*')
      .eq('id', resolvedModelId)
      .maybeSingle()

    if (modelReadError || !modelData) {
      throw new Error('AI model configuration could not be loaded.')
    }
    const targetModel = modelData as AIModel

    // 4. Decode the actual stored bytes. Never fall back to an image identifier.
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
    const inferenceResult = await runDetection(downloadedBlob, targetModel)

    // Persist a whole validated run, including no findings, atomically. Other
    // methods and engineering confirmations are independent evidence.
    const { data: inserted, error: insertError } = await createServiceClient().rpc('replace_image_detections', {
      p_image_id: imageId, p_actor_id: userId, p_provenance: 'heuristic',
      p_rows: inferenceResult.detections.map(result => ({ ...result, model_id: resolvedModelId })),
    })
    if (insertError) throw insertError
    const detections = (inserted ?? []) as AIDamageDetection[]

    // 5. Mark job completed
    const { data: completedJob, error: updateError } = await supabase
      .from('ai_analysis_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .select()
      .single()

    if (updateError || !completedJob) {
      throw updateError ?? new Error('Failed to complete AI analysis job')
    }

    // 6. Update parent inspection risk score
    await updateInspectionRiskFromAI(supabase, imageId)

    return {
      job: completedJob as AIAnalysisJob,
      detections,
    }
  } catch (error) {
    await supabase
      .from('ai_analysis_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown inference error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

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
  const safeNotes = notes ? z.string().max(2000).parse(notes) : ''

  const updates: Record<string, unknown> = {
    notes: safeNotes,
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

  // Auto-generate Maintenance Priority for verified high / critical defects
  if (approved && (updatedDetection.severity === 'critical' || updatedDetection.severity === 'high')) {
    try {
      // Find parent project and inspection
      const { data: img } = await supabase
        .from('inspection_images')
        .select('caption, inspection_id, inspections(project_id, location)')
        .eq('id', updatedDetection.image_id)
        .single()

      const inspection = img?.inspections as { project_id?: string; location?: string } | null
      const projectId = inspection?.project_id

      if (projectId) {
        // Idempotency: re-verifying the same detection must not create a second
        // maintenance ticket.
        const { data: existingTicket } = await supabase
          .from('maintenance_priorities')
          .select('id')
          .ilike('notes', `%${detectionId}%`)
          .limit(1)

        if (existingTicket && existingTicket.length > 0) {
          return updatedDetection as AIDamageDetection
        }

        const daysUntilDue = updatedDetection.severity === 'critical' ? 7 : 14
        const dueDate = new Date(Date.now() + daysUntilDue * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

        const { error: ticketError } = await supabase.from('maintenance_priorities').insert({
          project_id: projectId,
          title: `AI Defect: ${updatedDetection.damage_type.toUpperCase()} (${updatedDetection.severity.toUpperCase()})`,
          location: inspection?.location || img?.caption || 'Structural Asset',
          risk_score: Math.min(10, Math.max(1, Number((updatedDetection.severity_score / 10).toFixed(1)))),
          status: 'pending',
          due_date: dueDate,
          notes: `Automated priority from verified AI detection (${detectionId}). ${safeNotes}`,
        })

        if (ticketError) {
          console.error('Auto-create maintenance priority failed:', ticketError.message)
        }
      }
    } catch (maintErr) {
      console.error('Auto-create maintenance priority error:', maintErr)
    }
  }

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

  // Recalculate inspection risk score
  if (updatedDetection.image_id) {
    await updateInspectionRiskFromAI(supabase, updatedDetection.image_id)
  }

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
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as AIDamageDetection[]
  }

  const { data, error } = await supabase
    .from('ai_damage_detections')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data || []) as AIDamageDetection[]
}
