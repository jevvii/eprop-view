'use server'

import { createClient } from '@/app/lib/supabase/server'
import { computeFinalDamageScore, scoreToRiskLevel, severityToScore } from '@/app/lib/damage-score'
import type { ARSession, ARAnchor, ARPose, Vector3, DamageType, SeverityLevel } from '@/app/types'

/**
 * Get the active AR session for an inspection, if any.
 */
export async function getActiveARSession(inspectionId: string): Promise<ARSession | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ar_sessions')
    .select('*')
    .eq('inspection_id', inspectionId)
    .in('status', ['active', 'paused'])
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data as ARSession | null
}

/**
 * Get all anchors for an inspection.
 */
export async function getARAnchorsForInspection(inspectionId: string): Promise<ARAnchor[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ar_anchors')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as ARAnchor[]
}

/**
 * Start a new AR session for an inspection.
 */
export async function startARSession(
  inspectionId: string,
  deviceInfo?: Record<string, unknown>
): Promise<ARSession> {
  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    throw authError ?? new Error('Not authenticated')
  }

  const { data, error } = await supabase
    .from('ar_sessions')
    .insert({
      inspection_id: inspectionId,
      started_by: authData.user.id,
      status: 'active',
      device_info: deviceInfo ?? {},
    })
    .select()
    .single()

  if (error) throw error
  return data as ARSession
}

/**
 * Mark an AR session as completed.
 */
export async function endARSession(sessionId: string): Promise<ARSession> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ar_sessions')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single()

  if (error) throw error
  return data as ARSession
}

interface CreateARAnchorInput {
  sessionId: string
  inspectionId: string
  label: string
  pose: ARPose
  worldPosition?: Vector3
  damageType?: DamageType
  severity?: SeverityLevel
  detectionId?: string
  notes?: string
  snapshotPath?: string
}

/**
 * Persist a new AR anchor and update parent inspection damage telemetry.
 */
export async function createARAnchor(input: CreateARAnchorInput): Promise<ARAnchor> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ar_anchors')
    .insert({
      session_id: input.sessionId,
      inspection_id: input.inspectionId,
      detection_id: input.detectionId ?? null,
      label: input.label,
      damage_type: input.damageType ?? null,
      severity: input.severity ?? null,
      pose: input.pose,
      world_position: input.worldPosition ?? null,
      notes: input.notes ?? '',
      snapshot_path: input.snapshotPath ?? null,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create AR anchor')

  if (input.severity) {
    try {
      const score = computeFinalDamageScore(severityToScore(input.severity), 1.2, 1.0, 1.0)
      const riskLevel = scoreToRiskLevel(score)
      await supabase
        .from('inspections')
        .update({
          risk_score: score,
          risk_level: riskLevel,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.inspectionId)
    } catch (e) {
      console.warn('AR anchor inspection risk update failed:', e)
    }
  }

  return data as ARAnchor
}

/**
 * Get all anchors (optionally filtered by project).
 */
export async function getAllARAnchors(projectId?: string): Promise<ARAnchor[]> {
  const supabase = await createClient()

  if (projectId) {
    const { data: inspections } = await supabase
      .from('inspections')
      .select('id')
      .eq('project_id', projectId)

    if (!inspections || inspections.length === 0) return []
    const inspectionIds = inspections.map((i) => i.id)

    const { data, error } = await supabase
      .from('ar_anchors')
      .select('*')
      .in('inspection_id', inspectionIds)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []) as ARAnchor[]
  }

  const { data, error } = await supabase
    .from('ar_anchors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data || []) as ARAnchor[]
}
