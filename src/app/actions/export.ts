'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireCapabilityCheck } from '@/app/lib/dal'
import { z } from 'zod'

/**
 * CSV export.
 *
 * Generated on the server from the full result set, not from whatever page the
 * browser happens to be showing. Values are quoted and escaped so a comma or a
 * quote inside an inspection note cannot break the file.
 */

function csvCell(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','))
  }
  return lines.join('\r\n')
}

export interface CsvPayload {
  filename: string
  csv: string
  rowCount: number
}

const projectFilter = z.string().uuid().nullish()

export async function exportReportsCsv(projectId?: string | null): Promise<CsvPayload> {
  await requireCapabilityCheck('report:export')
  const parsedProject = projectFilter.parse(projectId ?? null)

  const supabase = await createClient()
  let query = supabase
    .from('reports')
    .select('report_id, title, date, location, status, risk_score, key_findings, project_name:projects(name)')
    .order('date', { ascending: false })

  if (parsedProject) query = query.eq('project_id', parsedProject)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []).map((report) => [
    report.report_id,
    report.title,
    report.date,
    report.location,
    report.status,
    report.risk_score,
    (report.project_name as { name?: string } | null)?.name ?? '',
    report.key_findings ?? '',
  ])

  const csv = toCsv(
    ['Report ID', 'Title', 'Date', 'Location', 'Status', 'Risk score', 'Project', 'Key findings'],
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
      'damage_type, severity, severity_score, confidence, provenance, crack_width_mm, crack_width_band, crack_orientation, crack_pattern, crack_cause, aci_reference, verified_at, image_id'
    )
    .order('created_at', { ascending: false })

  // Filtering detections by project needs the inspection join; the project list
  // is small, so it is resolved first rather than embedded in one deep query.
  if (parsedProject) {
    const { data: inspections } = await supabase.from('inspections').select('id').eq('project_id', parsedProject)
    const inspectionIds = (inspections ?? []).map((row) => row.id)
    if (inspectionIds.length === 0) {
      return { filename: 'detections.csv', csv: toCsv(['Damage type'], []), rowCount: 0 }
    }

    const { data: images } = await supabase
      .from('inspection_images')
      .select('id')
      .in('inspection_id', inspectionIds)
    const imageIds = (images ?? []).map((row) => row.id)
    if (imageIds.length === 0) {
      return { filename: 'detections.csv', csv: toCsv(['Damage type'], []), rowCount: 0 }
    }

    query = query.in('image_id', imageIds)
  }

  const { data, error } = await query
  if (error) throw error

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
    .order('risk_score', { ascending: false })

  if (parsedProject) query = query.eq('project_id', parsedProject)

  const { data, error } = await query
  if (error) throw error

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
