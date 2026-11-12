'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { recordAuditEvent } from '@/app/lib/audit'
import { readAllRows } from '@/app/lib/record-export'
import { EXPORT_OMISSIONS, RECORD_COLLECTIONS, parseRecordExport, type ExportRow, type RecordCollection, type RecordCollections } from '@/app/lib/record-schema'
import { z } from 'zod'

/** Operational record transfer, not infrastructure backup or evidence recovery. */
export interface ProjectExport {
  exportedAt: string
  schemaVersion: 2
  project: ExportRow
  records: RecordCollections
  omissions: string[]
  counts: { inspections: number; reports: number; maintenance: number; hotspots: number; total: number }
}

export async function exportProjectRecords(projectId: string): Promise<ProjectExport> {
  await requireRole(['admin'])
  const id = z.string().uuid().parse(projectId)
  const supabase = await createClient()
  const { data: project, error } = await supabase.from('projects').select('*').eq('id', id).single()
  if (error || !project) throw error ?? new Error('Project not found')

  const records = parseRecordExport({ schemaVersion: 2, project, records: {} }).records
  const readRelated = async (table: RecordCollection, column: string, ids: string[]): Promise<ExportRow[]> => {
    const result = new Map<string, ExportRow>()
    const unique = [...new Set(ids)]
    for (let offset = 0; offset < unique.length; offset += 100) {
      const group = unique.slice(offset, offset + 100)
      const rows = await readAllRows<ExportRow>((from, to) =>
        supabase.from(table).select('*').in(column, group).order('id').range(from, to))
      for (const row of rows) result.set(String(row.id), row)
    }
    return [...result.values()]
  }
  const ids = (name: RecordCollection) => records[name].map(row => String(row.id))
  for (const table of ['buildings', 'inspections', 'reports', 'maintenance_priorities', 'environmental_risks', 'risk_hotspots', 'geospatial_zones'] as const) {
    records[table] = await readRelated(table, 'project_id', [id])
  }
  records.floors = await readRelated('floors', 'building_id', ids('buildings'))
  records.structural_elements = await readRelated('structural_elements', 'floor_id', ids('floors'))
  for (const table of ['settlement_observations', 'rebound_tests', 'checklist_responses', 'forensic_assessments'] as const) {
    records[table] = await readRelated(table, 'inspection_id', ids('inspections'))
  }
  // Site-level field data may be recorded without an inspection or project FK.
  const settlements = await readRelated('settlement_observations', 'building_id', ids('buildings'))
  records.settlement_observations = [...new Map([...records.settlement_observations, ...settlements].map(row => [row.id, row])).values()]
  const soils = await readRelated('soil_investigations', 'project_id', [id])
  const buildingSoils = await readRelated('soil_investigations', 'building_id', ids('buildings'))
  records.soil_investigations = [...new Map([...soils, ...buildingSoils].map(row => [row.id, row])).values()]
  records.rebound_readings = await readRelated('rebound_readings', 'test_id', ids('rebound_tests'))
  records.report_limitations = await readRelated('report_limitations', 'report_id', ids('reports'))
  for (const table of ['cost_estimates', 'recommendations'] as const) {
    const byInspection = await readRelated(table, 'inspection_id', ids('inspections'))
    const byReport = await readRelated(table, 'report_id', ids('reports'))
    records[table] = [...new Map([...byInspection, ...byReport].map(row => [row.id, row])).values()]
  }

  return { exportedAt: new Date().toISOString(), schemaVersion: 2, project, records, omissions: [...EXPORT_OMISSIONS], counts: {
    inspections: records.inspections.length, reports: records.reports.length,
    maintenance: records.maintenance_priorities.length, hotspots: records.risk_hotspots.length,
    total: RECORD_COLLECTIONS.reduce((sum, name) => sum + records[name].length, 0),
  } }
}

export interface ImportPreview {
  projectName: string
  inspections: number
  reports: number
  maintenance: number
  warnings: string[]
}
export interface ImportResult extends ImportPreview { projectId: string | null; imported: boolean }

export async function importProjectRecords(payload: unknown, options: { dryRun?: boolean } = {}): Promise<ImportResult> {
  await requireRole(['admin'])
  const parsed = parseRecordExport(payload)
  const preview: ImportPreview = {
    projectName: String(parsed.project.name), inspections: parsed.records.inspections.length,
    reports: parsed.records.reports.length, maintenance: parsed.records.maintenance_priorities.length,
    warnings: [...EXPORT_OMISSIONS],
  }
  if (options.dryRun ?? true) return { ...preview, projectId: null, imported: false }

  const supabase = await createClient()
  // One PostgreSQL function runs the entire import transaction. Any bad row
  // aborts everything, including the new project; no "skipped" partial restore.
  const { data, error } = await supabase.rpc('import_project_records', { p_export: parsed })
  if (error || !data) throw error ?? new Error('The record import did not complete.')
  const projectId = z.string().uuid().parse(data)
  await recordAuditEvent({ action: 'project.import', entityType: 'project', entityId: projectId, after: { source: parsed.project.name, inspections: preview.inspections, reports: preview.reports } })
  return { ...preview, projectId, imported: true }
}
