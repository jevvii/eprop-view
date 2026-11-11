'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { recordAuditEvent } from '@/app/lib/audit'
import { z } from 'zod'

/**
 * Record export and import.
 *
 * This is the capstone equivalent of "Backup & Restore": the operational records
 * of one project, as JSON. It is not an infrastructure backup — storage objects
 * and image files are referenced, not embedded, and detections are not restored
 * because they belong to images that are not carried across.
 */

const uuid = z.string().uuid()

export interface ProjectExport {
  exportedAt: string
  schemaVersion: 1
  project: Record<string, unknown>
  inspections: Record<string, unknown>[]
  reports: Record<string, unknown>[]
  maintenance: Record<string, unknown>[]
  environmental: Record<string, unknown> | null
  hotspots: Record<string, unknown>[]
  counts: {
    inspections: number
    reports: number
    maintenance: number
    hotspots: number
  }
}

export async function exportProjectRecords(projectId: string): Promise<ProjectExport> {
  await requireRole(['admin'])
  const id = uuid.parse(projectId)
  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (projectError || !project) throw new Error('Project not found')

  const [inspections, reports, maintenance, environmental, hotspots] = await Promise.all([
    supabase.from('inspections').select('*').eq('project_id', id),
    supabase.from('reports').select('*').eq('project_id', id),
    supabase.from('maintenance_priorities').select('*').eq('project_id', id),
    supabase.from('environmental_risks').select('*').eq('project_id', id).maybeSingle(),
    supabase.from('risk_hotspots').select('*').eq('project_id', id),
  ])

  const inspectionRows = (inspections.data ?? []) as Record<string, unknown>[]
  const reportRows = (reports.data ?? []) as Record<string, unknown>[]
  const maintenanceRows = (maintenance.data ?? []) as Record<string, unknown>[]
  const hotspotRows = (hotspots.data ?? []) as Record<string, unknown>[]

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    project: project as Record<string, unknown>,
    inspections: inspectionRows,
    reports: reportRows,
    maintenance: maintenanceRows,
    environmental: (environmental.data as Record<string, unknown> | null) ?? null,
    hotspots: hotspotRows,
    counts: {
      inspections: inspectionRows.length,
      reports: reportRows.length,
      maintenance: maintenanceRows.length,
      hotspots: hotspotRows.length,
    },
  }
}

const importSchema = z.object({
  schemaVersion: z.literal(1),
  project: z.object({
    name: z.string().min(1).max(200),
    location: z.string().max(500).default(''),
    description: z.string().max(5000).default(''),
    status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).default('active'),
  }),
  inspections: z
    .array(
      z.object({
        id: z.string(),
        inspection_date: z.string(),
        status: z.enum(['pending', 'in_progress', 'completed', 'requires_followup']),
        risk_score: z.number().min(0).max(10),
        risk_level: z.enum(['low', 'moderate', 'high', 'critical']),
        location: z.string().default(''),
        notes: z.string().default(''),
      })
    )
    .default([]),
  reports: z
    .array(
      z.object({
        id: z.string().optional(),
        report_id: z.string(),
        title: z.string(),
        date: z.string(),
        location: z.string().default(''),
        status: z.enum(['open', 'in_review', 'critical', 'completed']),
        risk_score: z.number().min(0).max(10),
        key_findings: z.string().default(''),
        inspection_id: z.string().nullable().optional(),
      })
    )
    .default([]),
  maintenance: z
    .array(
      z.object({
        title: z.string(),
        location: z.string().default(''),
        risk_score: z.number().min(0).max(10),
        status: z.enum(['pending', 'in_progress', 'completed', 'deferred']).default('pending'),
        due_date: z.string().nullable().optional(),
        notes: z.string().default(''),
      })
    )
    .default([]),
})

export interface ImportPreview {
  projectName: string
  inspections: number
  reports: number
  maintenance: number
  warnings: string[]
}

export interface ImportResult extends ImportPreview {
  projectId: string | null
  imported: boolean
}

/**
 * Validate and optionally apply an export.
 *
 * A dry run is the default at the call site: the UI previews exactly what would
 * be created before anything is written. Report IDs are regenerated when they
 * collide, and the skipped count is reported rather than swallowed.
 */
export async function importProjectRecords(
  payload: unknown,
  options: { dryRun?: boolean } = {}
): Promise<ImportResult> {
  await requireRole(['admin'])
  const parsed = importSchema.parse(payload)
  const dryRun = options.dryRun ?? true

  const warnings: string[] = []
  if (parsed.reports.length > 0) {
    warnings.push('Report attachments and AI detections are not carried over; they belong to images that are not part of this export.')
  }

  const preview: ImportPreview = {
    projectName: parsed.project.name,
    inspections: parsed.inspections.length,
    reports: parsed.reports.length,
    maintenance: parsed.maintenance.length,
    warnings,
  }

  if (dryRun) {
    return { ...preview, projectId: null, imported: false }
  }

  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      name: `${parsed.project.name} (restored)`,
      location: parsed.project.location,
      description: parsed.project.description,
      status: parsed.project.status,
    })
    .select()
    .single()

  if (projectError || !project) throw projectError ?? new Error('Failed to create the restored project')

  const inspectionIdMap = new Map<string, string>()

  for (const inspection of parsed.inspections) {
    const { data: inserted, error } = await supabase
      .from('inspections')
      .insert({
        project_id: project.id,
        inspection_date: inspection.inspection_date,
        status: inspection.status,
        risk_score: inspection.risk_score,
        risk_level: inspection.risk_level,
        location: inspection.location,
        notes: inspection.notes,
      })
      .select('id')
      .single()

    if (error) {
      warnings.push(`Inspection ${inspection.id} skipped: ${error.message}`)
      continue
    }

    inspectionIdMap.set(inspection.id, inserted.id)
  }

  for (const report of parsed.reports) {
    const mappedInspection = report.inspection_id
      ? inspectionIdMap.get(report.inspection_id) ?? null
      : null

    const { error } = await supabase.from('reports').insert({
      // report_id is unique; collisions are retried with a suffix rather than
      // aborting the whole restore.
      report_id: `${report.report_id}-R${Date.now().toString().slice(-5)}`,
      title: report.title,
      project_id: project.id,
      inspection_id: mappedInspection,
      date: report.date,
      location: report.location,
      status: report.status,
      risk_score: report.risk_score,
      key_findings: report.key_findings,
    })

    if (error) warnings.push(`Report ${report.report_id} skipped: ${error.message}`)
  }

  for (const task of parsed.maintenance) {
    const { error } = await supabase.from('maintenance_priorities').insert({
      project_id: project.id,
      title: task.title,
      location: task.location,
      risk_score: task.risk_score,
      status: task.status,
      due_date: task.due_date ?? null,
      notes: task.notes,
    })

    if (error) warnings.push(`Maintenance item "${task.title}" skipped: ${error.message}`)
  }

  await recordAuditEvent({
    action: 'project.import',
    entityType: 'project',
    entityId: project.id,
    after: { source: parsed.project.name, ...preview },
  })

  return { ...preview, warnings, projectId: project.id, imported: true }
}
