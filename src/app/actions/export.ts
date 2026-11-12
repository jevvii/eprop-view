'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireCapabilityCheck } from '@/app/lib/dal'
import { z } from 'zod'
import type { WorkspaceFilters } from '@/app/lib/workspace-filters'
import { readAllRows, toCsv } from '@/app/lib/record-export'

/**
 * CSV export.
 *
 * Generated on the server from the full result set, not from whatever page the
 * browser happens to be showing. Values are quoted and escaped so a comma or a
 * quote inside an inspection note cannot break the file.
 */

export interface CsvPayload {
  filename: string
  csv: string
  rowCount: number
}

const projectFilter = z.string().uuid().nullish()

export async function exportReportsCsv(projectId?: string | null, filters?: WorkspaceFilters): Promise<CsvPayload> {
  await requireCapabilityCheck('report:export')
  const parsedProject = projectFilter.parse(projectId ?? null)

  const supabase = await createClient()
  let query = supabase
    .from('reports')
    .select('report_id, title, date, location, status, risk_score, key_findings, content_updated_at, project_name:projects(name), recommendations(status,final_text,provenance,signed_at), report_limitations(standard_exclusions,free_text), cost_estimates(table_estimate_php,ai_likely_php,confirmed_at,divergence_flag)')
    .order('date', { ascending: false }).order('id')

  if (parsedProject) query = query.eq('project_id', parsedProject)

  if (filters) {
    const {getFilteredRecordIds}=await import('./filters')
    const ids=await getFilteredRecordIds('reports',filters)
    if(!ids.length)return {filename:'reports.csv',csv:toCsv(['Report ID'],[]),rowCount:0}
    query=query.in('id',ids)
  }
  const data = await readAllRows((from, to) => query.range(from, to))

  const rows = (data ?? []).map((report) => [
    report.report_id,
    report.title,
    report.date,
    report.location,
    report.status,
    report.risk_score,
    (report.project_name as { name?: string } | null)?.name ?? '',
    report.key_findings ?? '',
    (report.recommendations ?? []).filter(item => item.status === 'signed' && item.signed_at && report.content_updated_at && Date.parse(item.signed_at) >= Date.parse(report.content_updated_at)).map(item => `[${item.provenance}] ${item.final_text ?? ''}`).join('\n'),
    [report.report_limitations].flat().filter(Boolean).flatMap(item => [...(item.standard_exclusions ?? []), item.free_text ?? '']).filter(Boolean).join('\n'),
    (report.cost_estimates ?? []).filter(item => item.confirmed_at).map(item => `Table PHP ${item.table_estimate_php}; AI likely PHP ${item.ai_likely_php ?? 'not recorded'}`).join('\n'),
  ])

  const csv = toCsv(
    ['Report ID', 'Title', 'Date', 'Location', 'Status', 'Risk score', 'Project', 'Key findings', 'Signed recommendations (provenance)', 'Assessment limitations', 'Confirmed cost estimates'],
    rows
  )

  return { filename: `reports-${new Date().toISOString().slice(0, 10)}.csv`, csv, rowCount: rows.length }
}

export async function exportDetectionsCsv(projectId?: string | null): Promise<CsvPayload> {
  await requireCapabilityCheck('report:export')
  const parsedProject = projectFilter.parse(projectId ?? null)

  const supabase = await createClient()
  let query = supabase
    .from('ai_damage_detections')
    .select(
      'damage_type, severity, severity_score, confidence, provenance, crack_width_mm, crack_width_band, crack_orientation, crack_pattern, crack_cause, aci_reference, verified_at, image_id, inspection_images!inner(inspections!inner(project_id))'
    )
    .order('created_at', { ascending: false }).order('id')

  if (parsedProject) query = query.eq('inspection_images.inspections.project_id', parsedProject)

  const data = await readAllRows((from, to) => query.range(from, to))

  const rows = (data ?? []).map((detection) => [
    detection.damage_type,
    detection.severity,
    detection.severity_score,
    detection.confidence,
    detection.provenance,
    detection.crack_width_mm,
    detection.crack_width_band,
    detection.crack_orientation,
    detection.crack_pattern,
    detection.crack_cause,
    detection.aci_reference,
    detection.verified_at ? 'verified' : 'unverified',
    detection.image_id,
  ])

  const csv = toCsv(
    [
      'Damage type',
      'Severity',
      'Severity score',
      'Confidence',
      'Provenance',
      'Crack width (mm)',
      'Crack width band',
      'Orientation',
      'Pattern',
      'Probable cause',
      'ACI reference',
      'Verification',
      'Image id',
    ],
    rows
  )

  return { filename: `detections-${new Date().toISOString().slice(0, 10)}.csv`, csv, rowCount: rows.length }
}

export async function exportMaintenanceCsv(projectId?: string | null): Promise<CsvPayload> {
  await requireCapabilityCheck('report:export')
  const parsedProject = projectFilter.parse(projectId ?? null)

  const supabase = await createClient()
  let query = supabase
    .from('maintenance_priorities')
    .select('title, location, risk_score, status, due_date, notes, project_name:projects(name)')
    .order('risk_score', { ascending: false }).order('id')

  if (parsedProject) query = query.eq('project_id', parsedProject)

  const data = await readAllRows((from, to) => query.range(from, to))

  const rows = (data ?? []).map((task) => [
    task.title,
    task.location,
    task.risk_score,
    task.status,
    task.due_date,
    (task.project_name as { name?: string } | null)?.name ?? '',
    task.notes ?? '',
  ])

  const csv = toCsv(['Title', 'Location', 'Risk score', 'Status', 'Due date', 'Project', 'Notes'], rows)

  return { filename: `maintenance-${new Date().toISOString().slice(0, 10)}.csv`, csv, rowCount: rows.length }
}
