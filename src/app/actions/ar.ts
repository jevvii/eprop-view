'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { computeFinalDamageScore, scoreToRiskLevel, severityToScore } from '@/app/lib/damage-score'
import type { ARSession, ARAnchor, ARPose, Vector3, DamageType, SeverityLevel } from '@/app/types'

/**
 * Get the active AR session for an inspection, if any.
 * Accessible to inspector, engineer, and admin.
 */
export async function getActiveARSession(inspectionId: string): Promise<ARSession | null> {
  await requireRole(['inspector', 'engineer', 'admin'])
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
 * Accessible to inspector, engineer, and admin.
 */
export async function getARAnchorsForInspection(inspectionId: string): Promise<ARAnchor[]> {
  await requireRole(['inspector', 'engineer', 'admin'])
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
 * Role-gated to Inspector and Admin.
 * Inspectors can only start sessions on their own inspections.
 */
export async function startARSession(
  inspectionId: string,
  deviceInfo?: Record<string, unknown>
): Promise<ARSession> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  const supabase = await createClient()

  // Verify inspection exists and belongs to inspector if inspector
  const { data: inspection, error: inspError } = await supabase
    .from('inspections')
    .select('id, lead_inspector_id')
    .eq('id', inspectionId)
    .single()

  if (inspError || !inspection) {
    throw new Error('Inspection record not found')
  }

  if (role === 'inspector' && inspection.lead_inspector_id && inspection.lead_inspector_id !== userId) {
    throw new Error('Access denied: inspectors may only start AR sessions for their assigned inspections')
  }

  const { data, error } = await supabase
    .from('ar_sessions')
    .insert({
      inspection_id: inspectionId,
      started_by: userId,
      status: 'active',
      device_info: deviceInfo ?? {},
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to start AR session')
  return data as ARSession
}

/**
 * Mark an AR session as completed.
 */
export async function endARSession(sessionId: string): Promise<ARSession> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  const supabase = await createClient()

  if (role === 'inspector') {
    const { data: sessionData } = await supabase
      .from('ar_sessions')
      .select('started_by')
      .eq('id', sessionId)
      .single()

    if (sessionData?.started_by && sessionData.started_by !== userId) {
      throw new Error('Access denied: inspectors may only end their own AR sessions')
    }
  }

  const { data, error } = await supabase
    .from('ar_sessions')
    .update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to end AR session')
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
 * Role-gated to Inspector and Admin.
 */
export async function createARAnchor(input: CreateARAnchorInput): Promise<ARAnchor> {
  const { userId, role } = await requireRole(['inspector', 'admin'])

  if (!input.label || !input.label.trim()) {
    throw new Error('Anchor label is required')
  }

  const supabase = await createClient()

  // Verify inspection ownership if inspector
  if (role === 'inspector') {
    const { data: inspection, error: inspError } = await supabase
      .from('inspections')
      .select('id, lead_inspector_id')
      .eq('id', input.inspectionId)
      .single()

    if (inspError || !inspection) {
      throw new Error('Inspection record not found')
    }

    if (inspection.lead_inspector_id && inspection.lead_inspector_id !== userId) {
      throw new Error('Access denied: inspectors may only place AR anchors on their own inspections')
    }
  }

  const validSeverities: SeverityLevel[] = ['low', 'medium', 'high', 'critical']
  const severity = input.severity && validSeverities.includes(input.severity) ? input.severity : null

  const { data, error } = await supabase
    .from('ar_anchors')
    .insert({
      session_id: input.sessionId,
      inspection_id: input.inspectionId,
      detection_id: input.detectionId ?? null,
      label: input.label.trim(),
      damage_type: input.damageType ?? null,
      severity,
      pose: input.pose,
      world_position: input.worldPosition ?? null,
      notes: input.notes ?? '',
      snapshot_path: input.snapshotPath ?? null,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create AR anchor')

  if (severity) {
    try {
      const score = computeFinalDamageScore(severityToScore(severity), 1.2, 1.0, 1.0)
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
 * Accessible to inspector, engineer, and admin.
 */
export async function getAllARAnchors(projectId?: string): Promise<ARAnchor[]> {
  await requireRole(['inspector', 'engineer', 'admin'])
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
