'use server'

import sharp from 'sharp'
import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { computeFinalDamageScore, scoreToRiskLevel, severityToScore } from '@/app/lib/damage-score'
import type { ARSession, ARAnchor, ARPose, Vector3, DamageType, SeverityLevel } from '@/app/types'

const BUCKET = 'inspection-images'
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024

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
  if (!z.string().uuid().safeParse(inspectionId).success) {
    throw new Error('Invalid inspection id')
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ar_anchors')
    .select('*')
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false })

  if (error) throw error

  // Snapshots live in a private bucket. Return short-lived URLs rather than
  // storing (or exposing) object paths as if they were image sources.
  const anchors = (data || []) as ARAnchor[]
  const signed = await Promise.all(
    anchors.map(async (anchor) => {
      if (!anchor.snapshot_path) return anchor
      const { data: signedData } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(anchor.snapshot_path, 60 * 60)
      return { ...anchor, image_url: signedData?.signedUrl ?? undefined }
    })
  )

  return signed
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
  snapshotDataUrl?: string
}

const createAnchorSchema = z
  .object({
    sessionId: z.string().uuid(),
    inspectionId: z.string().uuid(),
    label: z.string().trim().min(1).max(200),
    pose: z
      .object({
        position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
        quaternion: z.object({ x: z.number(), y: z.number(), z: z.number(), w: z.number() }).optional(),
      })
      .passthrough(),
    worldPosition: z.object({ x: z.number(), y: z.number(), z: z.number() }).optional(),
    damageType: z.enum(['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    detectionId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
    snapshotDataUrl: z.string().max(12_000_000).optional(),
  })
  .strict()

async function storeSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dataUrl: string,
  inspectionId: string,
  userId: string
): Promise<string> {
  const match = /^data:image\/[a-z+.-]+;base64,/i.exec(dataUrl)
  if (!match) throw new Error('Invalid snapshot payload')

  const buffer = Buffer.from(dataUrl.slice(match[0].length), 'base64')
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error('Snapshot is empty or exceeds 8 MB')
  }

  const metadata = await sharp(buffer).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('Snapshot is not a readable image')
  }

  const normalized = await sharp(buffer)
    .rotate()
    .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()

  const storagePath = `${inspectionId}/${userId}/ar-${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, normalized, { contentType: 'image/jpeg', upsert: false })

  if (error) throw new Error(`Snapshot upload failed: ${error.message}`)
  return storagePath
}

/**
 * Persist a new AR anchor and update parent inspection damage telemetry.
 * Role-gated to Inspector and Admin.
 */
export async function createARAnchor(input: CreateARAnchorInput): Promise<ARAnchor> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  await enforceRateLimit(`ar-anchor:${userId}`, 60, 60)

  const parsed = createAnchorSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid anchor payload')
  }
  const anchorInput = parsed.data

  const supabase = await createClient()

  // Verify inspection ownership if inspector
  if (role === 'inspector') {
    const { data: inspection, error: inspError } = await supabase
      .from('inspections')
      .select('id, lead_inspector_id')
      .eq('id', anchorInput.inspectionId)
      .single()

    if (inspError || !inspection) {
      throw new Error('Inspection record not found')
    }

    if (inspection.lead_inspector_id && inspection.lead_inspector_id !== userId) {
      throw new Error('Access denied: inspectors may only place AR anchors on their own inspections')
    }
  }

  const validSeverities: SeverityLevel[] = ['low', 'medium', 'high', 'critical']
  const severity =
    anchorInput.severity && validSeverities.includes(anchorInput.severity) ? anchorInput.severity : null

  const snapshotPath = anchorInput.snapshotDataUrl
    ? await storeSnapshot(supabase, anchorInput.snapshotDataUrl, anchorInput.inspectionId, userId)
    : null

  const { data, error } = await supabase
    .from('ar_anchors')
    .insert({
      session_id: anchorInput.sessionId,
      inspection_id: anchorInput.inspectionId,
      detection_id: anchorInput.detectionId ?? null,
      label: anchorInput.label,
      damage_type: anchorInput.damageType ?? null,
      severity,
      pose: anchorInput.pose,
      world_position: anchorInput.worldPosition ?? null,
      notes: anchorInput.notes ?? '',
      snapshot_path: snapshotPath,
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
        .eq('id', anchorInput.inspectionId)
    } catch (e) {
      console.error('AR anchor inspection risk update failed:', e)
    }
  }

  return data as ARAnchor
}

/** Delete a saved marker, including one from a completed session. RLS remains enforced. */
export async function deleteARAnchor(anchorId: string): Promise<Pick<ARAnchor, 'id' | 'inspection_id'>> {
  const { userId, role } = await requireRole(['inspector', 'admin'])
  const parsedId = z.string().uuid().safeParse(anchorId)
  if (!parsedId.success) throw new Error('Invalid marker id')

  const supabase = await createClient()
  const { data: anchor, error: anchorError } = await supabase
    .from('ar_anchors')
    .select('id, session_id, inspection_id')
    .eq('id', parsedId.data)
    .maybeSingle()

  if (anchorError) throw anchorError
  if (!anchor) throw new Error('Marker not found')

  if (role === 'inspector') {
    const { data: session, error: sessionError } = await supabase
      .from('ar_sessions')
      .select('started_by')
      .eq('id', anchor.session_id)
      .maybeSingle()

    if (sessionError) throw sessionError
    if (!session || session.started_by !== userId) {
      throw new Error('Access denied: inspectors may only delete markers from their own sessions')
    }
  }

  const { data: deleted, error } = await supabase
    .from('ar_anchors')
    .delete()
    .eq('id', parsedId.data)
    .eq('inspection_id', anchor.inspection_id)
    .select('id, inspection_id')
    .maybeSingle()

  if (error) throw error
  if (!deleted) throw new Error('Marker was not deleted. It may no longer exist or you may not have permission.')
  return deleted
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
