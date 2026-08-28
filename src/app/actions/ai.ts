'use server'

import { createClient } from '@/app/lib/supabase/server'
import { computeFinalDamageScore, scoreToRiskLevel } from '@/app/lib/damage-score'
import type {
  AIModel,
  AIDamageDetection,
  AIAnalysisJob,
  DamageType,
  SeverityLevel,
} from '@/app/types'

/**
 * Return all active AI models. Falls back to all models if none are flagged
 * active so the prototype UI always has something to show.
 */
export async function getActiveAIModels(): Promise<AIModel[]> {
  const supabase = await createClient()

  const { data: activeData, error: activeError } = await supabase
    .from('ai_models')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (activeError) throw activeError

  if (activeData && activeData.length > 0) {
    return activeData as AIModel[]
  }

  const { data, error } = await supabase.from('ai_models').select('*').order('created_at', { ascending: false })
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
 * Deterministic mock inference used by the capstone prototype.
 * Uses a deterministic hash of imageId to pick 1–2 defects from a realistic catalog.
 */
function mockInference(imageId?: string): Pick<
  AIDamageDetection,
  'damage_type' | 'severity' | 'severity_score' | 'confidence' | 'bbox'
>[] {
  const catalog: Pick<
    AIDamageDetection,
    'damage_type' | 'severity' | 'severity_score' | 'confidence' | 'bbox'
  >[] = [
    {
      damage_type: 'crack',
      severity: 'high',
      severity_score: 75,
      confidence: 0.92,
      bbox: { x: 0.22, y: 0.32, width: 0.36, height: 0.14 },
    },
    {
      damage_type: 'spalling',
      severity: 'critical',
      severity_score: 95,
      confidence: 0.88,
      bbox: { x: 0.58, y: 0.44, width: 0.28, height: 0.25 },
    },
    {
      damage_type: 'corrosion',
      severity: 'medium',
      severity_score: 52,
      confidence: 0.82,
      bbox: { x: 0.15, y: 0.55, width: 0.32, height: 0.22 },
    },
    {
      damage_type: 'leakage',
      severity: 'medium',
      severity_score: 48,
      confidence: 0.79,
      bbox: { x: 0.45, y: 0.25, width: 0.26, height: 0.35 },
    },
    {
      damage_type: 'deformation',
      severity: 'low',
      severity_score: 28,
      confidence: 0.74,
      bbox: { x: 0.30, y: 0.60, width: 0.40, height: 0.18 },
    },
  ]

  if (!imageId) {
    return [catalog[0], catalog[1]]
  }

  // Deterministic seed from imageId characters
  const hash = imageId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const firstIndex = hash % catalog.length
  const secondIndex = (hash + 2) % catalog.length

  const first = catalog[firstIndex]
  const second = catalog[secondIndex]

  return firstIndex === secondIndex ? [first] : [first, second]
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

    const { data: detections } = await supabase
      .from('ai_damage_detections')
      .select('severity_score, severity')
      .in('image_id', imageIds)

    if (detections && detections.length > 0) {
      const maxScore = Math.max(...detections.map((d) => d.severity_score))
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
    console.warn('Failed to update inspection risk score from AI:', err)
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
  const supabase = await createClient()

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

    resolvedModelId = activeModels?.[0]?.id ?? null
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
    // 3. Clear existing detections for this image to prevent duplicate bounding boxes
    await supabase
      .from('ai_damage_detections')
      .delete()
      .eq('image_id', imageId)

    // 4. Generate deterministic inference results
    const mockResults = mockInference(imageId)

    const rows = mockResults.map((result) => ({
      image_id: imageId,
      model_id: resolvedModelId,
      ...result,
    }))

    const { data: detections, error: insertError } = await supabase
      .from('ai_damage_detections')
      .insert(rows)
      .select()

    if (insertError) throw insertError

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
      detections: (detections || []) as AIDamageDetection[],
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
  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    throw authError ?? new Error('Not authenticated')
  }

  const updates: Record<string, unknown> = {
    notes: notes ?? '',
  }

  if (approved) {
    updates.verified_by = authData.user.id
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
        const daysUntilDue = updatedDetection.severity === 'critical' ? 7 : 14
        const dueDate = new Date(Date.now() + daysUntilDue * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

        await supabase.from('maintenance_priorities').insert({
          project_id: projectId,
          title: `AI Defect: ${updatedDetection.damage_type.toUpperCase()} (${updatedDetection.severity.toUpperCase()})`,
          location: inspection?.location || img?.caption || 'Structural Asset',
          risk_score: Math.min(10, Math.max(1, Number((updatedDetection.severity_score / 10).toFixed(1)))),
          status: 'pending',
          due_date: dueDate,
          notes: `Automated priority from verified AI detection (${detectionId}). ${notes || ''}`,
        })
      }
    } catch (maintErr) {
      console.warn('Auto-create maintenance priority error:', maintErr)
    }
  }

  return updatedDetection as AIDamageDetection
}

/**
 * Adjust or edit AI detection parameters (Inspector Confirm/Edit & Engineer Validate/Adjust).
 * Updates damage type, severity, score, bbox, and notes, and recalculates parent inspection risk.
 */
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
  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    throw authError ?? new Error('Not authenticated')
  }

  const updates: Record<string, unknown> = {}
  if (params.damage_type !== undefined) updates.damage_type = params.damage_type
  if (params.severity !== undefined) updates.severity = params.severity
  if (params.severity_score !== undefined) updates.severity_score = params.severity_score
  if (params.confidence !== undefined) updates.confidence = params.confidence
  if (params.notes !== undefined) updates.notes = params.notes
  
  if (params.approved === true) {
    updates.verified_by = authData.user.id
    updates.verified_at = new Date().toISOString()
  } else if (params.approved === false) {
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
export async function getAllAIDetections(projectId?: string): Promise<AIDamageDetection[]> {
  const supabase = await createClient()

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
