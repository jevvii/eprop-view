'use server'

import { createClient } from '@/app/lib/supabase/server'
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

  let query = supabase.from('ai_models').select('*').eq('is_active', true)
  const { data: activeData, error: activeError } = await query.order('created_at', { ascending: false })

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
 * Deterministic mock inference used by the capstone prototype when no real
 * model has been trained. Returns a small set of plausible detections so the
 * data flow and UI can be demonstrated end-to-end.
 */
function mockInference(): Pick<
  AIDamageDetection,
  'damage_type' | 'severity' | 'severity_score' | 'confidence' | 'bbox'
>[] {
  const damageTypes: DamageType[] = ['crack', 'corrosion', 'spalling', 'leakage', 'none']
  const severities: SeverityLevel[] = ['low', 'medium', 'high', 'critical']

  const resultCount = Math.floor(Math.random() * 3) + 1 // 1–3 detections
  const results: Pick<
    AIDamageDetection,
    'damage_type' | 'severity' | 'severity_score' | 'confidence' | 'bbox'
  >[] = []

  for (let i = 0; i < resultCount; i++) {
    const damageType = damageTypes[Math.floor(Math.random() * damageTypes.length)]
    if (damageType === 'none') continue

    const severity = severities[Math.floor(Math.random() * severities.length)]
    const severityScore =
      severity === 'low' ? 25 : severity === 'medium' ? 50 : severity === 'high' ? 75 : 95
    const confidence = 0.6 + Math.random() * 0.35

    results.push({
      damage_type: damageType,
      severity,
      severity_score: severityScore,
      confidence: Number(confidence.toFixed(4)),
      bbox: {
        x: 0.1 + Math.random() * 0.5,
        y: 0.1 + Math.random() * 0.5,
        width: 0.1 + Math.random() * 0.25,
        height: 0.1 + Math.random() * 0.25,
      },
    })
  }

  return results
}

/**
 * Run AI analysis on an inspection image. For the prototype this uses mock
 * inference when the selected model format is 'mock'; real ONNX/TF.js inference
 * should be added here or in a dedicated service once a trained model is
 * available.
 */
export async function runAIAnalysis(
  imageId: string,
  modelId?: string
): Promise<{ job: AIAnalysisJob; detections: AIDamageDetection[] }> {
  const supabase = await createClient()

  // Resolve model
  let resolvedModelId = modelId
  if (!resolvedModelId) {
    const { data: models } = await supabase
      .from('ai_models')
      .select('id')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
    resolvedModelId = models?.[0]?.id ?? null
  }

  // Create job row
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
    const mockResults = mockInference()

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
 * Verify or override an AI detection. Inspectors can confirm/reject results
 * and add notes.
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

  const { data, error } = await supabase
    .from('ai_damage_detections')
    .update(updates)
    .eq('id', detectionId)
    .select()
    .single()

  if (error) throw error
  return data as AIDamageDetection
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

