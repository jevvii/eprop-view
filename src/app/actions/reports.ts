'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { reportFormSchema } from '@/app/lib/validators'
import { updateReportWithRevision } from './reports-v2'
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

  if (parsed.data.status === 'completed') {
    throw new Error('Create a draft first. Complete it after recommendations and limitations are reviewed.')
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
  void previousStatus // The database, never a client-supplied status, determines the transition.
  const result = await updateReportWithRevision({
    reportId: id,
    status: updates.status,
    riskScore: updates.risk_score,
    keyFindings: updates.key_findings ?? undefined,
  })
  return result.report as Partial<Report>
}
