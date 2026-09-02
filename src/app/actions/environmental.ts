'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { environmentalRiskSchema } from '@/app/lib/validators'
import type { EnvironmentalRisk } from '@/app/types'

/**
 * Upsert environmental risk assessment for a project.
 * Role-gated to Engineer and Admin.
 */
export async function upsertEnvironmentalRiskAction(
  payload: Partial<EnvironmentalRisk> & { project_id: string }
): Promise<EnvironmentalRisk> {
  await requireRole(['engineer', 'admin'])

  const parsed = environmentalRiskSchema.safeParse({
    fault_line_proximity: payload.fault_line_proximity,
    soil_liquefaction_risk: payload.soil_liquefaction_risk,
    erosion_potential: payload.erosion_potential,
    overall_risk_score: payload.overall_risk_score,
    additional_analysis: payload.additional_analysis,
  })

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid environmental risk assessment data')
  }

  const supabase = await createClient()

  const dataToSave = {
    project_id: payload.project_id,
    ...parsed.data,
    assessed_date: payload.assessed_date || new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('environmental_risks')
    .upsert(dataToSave, { onConflict: 'project_id' })
    .select()
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to persist environmental risk profile')
  }

  return data as EnvironmentalRisk
}

/**
 * Update environmental risk assessment by ID.
 * Role-gated to Engineer and Admin.
 */
export async function updateEnvironmentalRiskAction(
  id: string,
  updates: Partial<EnvironmentalRisk>
): Promise<EnvironmentalRisk> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('environmental_risks')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to update environmental risk profile')
  }

  return data as EnvironmentalRisk
}

/**
 * Automatically calculates environmental risk scores from GIS hazard layers
 * and saves proposal to project environmental_risks.
 * Role-gated to Engineer and Admin.
 */
export async function calculateAndApplyProjectRisk(projectId: string): Promise<EnvironmentalRisk> {
  await requireRole(['engineer', 'admin'])

  const { computeProjectEnvironmentalRisk } = await import('@/app/lib/environmental/scoring')
  const computation = await computeProjectEnvironmentalRisk(projectId)

  return upsertEnvironmentalRiskAction({
    project_id: projectId,
    overall_risk_score: computation.overall_risk_score,
    fault_line_proximity: computation.fault_line_proximity,
    soil_liquefaction_risk: computation.soil_liquefaction_risk,
    erosion_potential: computation.erosion_potential,
    additional_analysis: computation.additional_analysis,
  })
}

