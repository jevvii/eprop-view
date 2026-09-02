'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole, verifySession } from '@/app/lib/dal'
import { inspectionFormSchema } from '@/app/lib/validators'
import { scoreToRiskLevel } from '@/app/lib/damage-score'
import type { Inspection } from '@/app/types'

/**
 * Create a new inspection record.
 * Restricted strictly to Inspector and Admin roles.
 * Automatically scopes lead_inspector_id to current user if inspector.
 */
export async function createInspection(input: unknown): Promise<Inspection> {
  const { userId, role } = await requireRole(['inspector', 'admin'])

  const parsed = inspectionFormSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid inspection parameters')
  }

  const supabase = await createClient()
  const riskScore = parsed.data.risk_score
  const riskLevel = scoreToRiskLevel(riskScore)

  const payload = {
    project_id: parsed.data.project_id,
    inspection_date: parsed.data.inspection_date,
    location: parsed.data.location,
    floor: parsed.data.floor ?? 'Ground Floor',
    structural_element: parsed.data.structural_element ?? 'general',
    building_id: parsed.data.building_id || null,
    floor_id: parsed.data.floor_id || null,
    structural_element_id: parsed.data.structural_element_id || null,
    risk_score: riskScore,
    risk_level: riskLevel,
    status: parsed.data.status,
    notes: parsed.data.notes ?? '',
    lead_inspector_id: role === 'inspector' ? userId : ((input as Record<string, unknown>)?.lead_inspector_id as string) || userId,
  }

  const { data, error } = await supabase
    .from('inspections')
    .insert(payload)
    .select()
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to create inspection record')
  }

  return data as Inspection
}

/**
 * Get inspections scoped according to RBAC:
 * - Inspector: only returns own inspections (lead_inspector_id = auth.uid())
 * - Engineer / Admin: returns all inspections
 * - Viewer: returns empty array
 */
export async function getScopedInspections(projectId?: string): Promise<Inspection[]> {
  const session = await verifySession()
  const supabase = await createClient()

  let query = supabase
    .from('inspections')
    .select('*')
    .order('inspection_date', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  if (session.role === 'inspector') {
    query = query.eq('lead_inspector_id', session.userId)
  } else if (session.role === 'viewer') {
    return []
  }

  const { data, error } = await query
  if (error) throw error

  return (data || []) as Inspection[]
}
