import { z } from 'zod'

export const RECORD_COLLECTIONS = [
  'buildings', 'floors', 'structural_elements', 'inspections', 'reports',
  'maintenance_priorities', 'environmental_risks', 'risk_hotspots', 'geospatial_zones',
  'settlement_observations', 'rebound_tests', 'rebound_readings', 'soil_investigations',
  'checklist_responses', 'forensic_assessments', 'report_limitations', 'cost_estimates', 'recommendations',
] as const
export type RecordCollection = (typeof RECORD_COLLECTIONS)[number]
export type ExportRow = Record<string, unknown>
export type RecordCollections = Record<RecordCollection, ExportRow[]>

export const EXPORT_OMISSIONS = [
  'Image/model binaries, AI detections, image comments, and AR sessions/anchors are not included.',
  'Revision and audit history, public share links, user accounts, and profile assignments are not restored.',
  'Engineering approvals and signatures are invalidated: restored reports are open and recommendations are drafts requiring a new review.',
  'Forensic image/detection evidence links are omitted because their evidence files are not included.',
]
const rowSchema = z.record(z.string(), z.unknown()).refine(row => typeof row.id === 'string' && z.string().uuid().safeParse(row.id).success, 'Each record must have a UUID id.')
const collectionShape = Object.fromEntries(RECORD_COLLECTIONS.map(name => [name, z.array(rowSchema).max(100_000).default([])])) as Record<RecordCollection, z.ZodDefault<z.ZodArray<typeof rowSchema>>>
const projectSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  location: z.string().max(500).nullable().optional().transform(value => value ?? ''),
  description: z.string().max(5000).nullable().optional().transform(value => value ?? ''),
  status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).default('active'),
}).passthrough()
const exportSchema = z.object({ schemaVersion: z.literal(2), project: projectSchema, records: z.object(collectionShape), omissions: z.array(z.string()).optional() })

/** Legacy files are upgraded to the same explicit subset before import. */
export function parseRecordExport(input: unknown): { schemaVersion: 2; project: ExportRow; records: RecordCollections } {
  let candidate = input
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 1) {
    const old = input as ExportRow
    candidate = { schemaVersion: 2, project: old.project, records: {
      inspections: old.inspections ?? [], reports: old.reports ?? [], maintenance_priorities: old.maintenance ?? [],
      environmental_risks: old.environmental ? [old.environmental] : [], risk_hotspots: old.hotspots ?? [],
    } }
  }
  const parsed = exportSchema.parse(candidate)
  const ids = new Set<string>()
  for (const name of RECORD_COLLECTIONS) {
    for (const row of parsed.records[name]) {
      const id = row.id as string
      if (ids.has(id)) throw new Error(`Duplicate record id in import: ${id}`)
      ids.add(id)
    }
  }
  return { schemaVersion: 2, project: parsed.project, records: parsed.records }
}
