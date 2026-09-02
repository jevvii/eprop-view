'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { reportFormSchema } from '@/app/lib/validators'
import type { Report } from '@/app/types'

/**
 * Create a new engineering inspection report.
 * Role-gated to Engineer and Admin.
 */
export async function createReportAction(input: unknown): Promise<Report> {
  const { userId } = await requireRole(['engineer', 'admin'])

  const parsed = reportFormSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid report parameters')
  }

  const supabase = await createClient()

  const payload = {
    ...parsed.data,
    created_by: userId,
    last_edited_by: userId,
  }

  // Use stored procedure if present, otherwise direct insert
  const { data, error } = await supabase.rpc('create_report_with_id', { report_data: payload })
  if (!error && data) return data as Report

  // Fallback direct insert
  const { data: directData, error: directError } = await supabase
    .from('reports')
    .insert(payload)
    .select()
    .single()

  if (directError || !directData) {
    throw directError ?? new Error('Failed to create report record')
  }

  return directData as Report
}

/**
 * Update an existing inspection report.
 * Role-gated to Engineer and Admin.
 */
export async function updateReportAction(
  id: string,
  updates: Partial<Pick<Report, 'status' | 'risk_score' | 'key_findings'>>,
  previousStatus?: Report['status']
): Promise<Partial<Report>> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const supabase = await createClient()

  const now = new Date().toISOString()
  const payload: Record<string, unknown> = {
    ...updates,
    last_edited_by: userId,
    last_edited_at: now,
  }

  if (updates.status === 'completed' && previousStatus !== 'completed') {
    payload.reviewed_by = userId
    payload.reviewed_at = now
  }

  const { data, error } = await supabase
    .from('reports')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    // If audit columns are missing in some environment, fallback to updates without audit fields
    if (error.code === '42703') {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('reports')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (fallbackError) throw fallbackError
      return fallbackData
    }
    throw error
  }

  return data
}
