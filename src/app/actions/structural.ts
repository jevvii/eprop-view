'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { recordAuditEvent } from '@/app/lib/audit'
import { actionOk, actionRefuse, type ActionResult } from '@/app/lib/action-result'
import { classifySettlement } from '@/app/lib/structural/settlement'
import { assessCrack } from '@/app/lib/structural/crack-taxonomy'
import { summarizeReadings } from '@/app/lib/structural/rebound'
import { z } from 'zod'
import { computeProjectEnvironmentalRisk } from '@/app/lib/environmental/scoring'
import type {
  ChecklistResponse,
  ChecklistResponseItem,
  ChecklistTemplate,
  ForensicAssessment,
  ForensicEvidence,
  Inspection,
  ReboundTest,
  SettlementObservation,
  SoilInvestigation,
} from '@/app/types'

/**
 * Server actions for the capstone v2 domain (migration 017).
 *
 * Rules applied throughout:
 *  - every derived value (settlement classification, rebound summary) is
 *    computed here, never accepted from the client
 *  - every mutation is validated with a strict zod schema
 *  - every mutation writes an audit event
 */

const uuid = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected an ISO date (YYYY-MM-DD)')

// -----------------------------------------------------------------
// A1. Tilt / settlement
// -----------------------------------------------------------------

const settlementSchema = z
  .object({
    buildingId: uuid,
    inspectionId: uuid.nullish(),
    tiltMmPerM: z.number().min(0).max(500).nullish(),
    differentialSettlementMm: z.number().min(0).max(5000).nullish(),
    measurementMethod: z.enum(['manual', 'level', 'plumb', 'instrument']).default('manual'),
    notes: z.string().max(4000).default(''),
  })
  .strict()

export async function recordSettlementObservation(
  input: z.input<typeof settlementSchema>
): Promise<SettlementObservation> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = settlementSchema.parse(input)

  if (parsed.tiltMmPerM == null && parsed.differentialSettlementMm == null) {
    throw new Error('Enter at least one measurement: tilt or differential settlement.')
  }

  const supabase = await createClient()
  if (!parsed.inspectionId) throw new Error('Select an inspection before recording movement.')
  const { data: inspection, error: inspectionError } = await supabase.from('inspections')
    .select('building_id').eq('id', parsed.inspectionId).single()
  if (inspectionError || !inspection || inspection.building_id !== parsed.buildingId) {
    throw new Error('The movement reading must use the building linked to its inspection.')
  }
  const classification = classifySettlement(parsed.tiltMmPerM, parsed.differentialSettlementMm)

  const { data, error } = await supabase
    .from('settlement_observations')
    .insert({
      building_id: parsed.buildingId,
      inspection_id: parsed.inspectionId ?? null,
      tilt_mm_per_m: parsed.tiltMmPerM ?? null,
      differential_settlement_mm: parsed.differentialSettlementMm ?? null,
      classification,
      measurement_method: parsed.measurementMethod,
      notes: parsed.notes,
      recorded_by: userId,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to record settlement observation')

  await recordAuditEvent({
    action: 'settlement.record',
    entityType: 'settlement_observation',
    entityId: data.id,
    after: { classification, tilt: parsed.tiltMmPerM, settlement: parsed.differentialSettlementMm },
  })

  return data as SettlementObservation
}

export async function getSettlementObservations(buildingId: string): Promise<SettlementObservation[]> {
  const parsedId = uuid.parse(buildingId)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('settlement_observations')
    .select('*')
    .eq('building_id', parsedId)
    .order('observed_at', { ascending: false })
    .limit(50)

  if (error) throw error
  return (data || []) as SettlementObservation[]
}

// -----------------------------------------------------------------
// B1. Rebound hammer
// -----------------------------------------------------------------

const reboundSchema = z
  .object({
    inspectionId: uuid,
    structuralElementId: uuid.nullish(),
    testDate: isoDate.optional(),
    impactDirection: z.enum(['horizontal', 'upward', 'downward', 'any']).default('horizontal'),
    instrumentSerial: z.string().max(120).nullish(),
    readings: z.array(z.number().min(10).max(100)).min(1).max(30),
    notes: z.string().max(4000).default(''),
  })
  .strict()

export async function createReboundTest(
  input: z.input<typeof reboundSchema>
): Promise<ReboundTest> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = reboundSchema.parse(input)
  const summary = summarizeReadings(parsed.readings)

  const supabase = await createClient()

  const { data: test, error } = await supabase
    .from('rebound_tests')
    .insert({
      inspection_id: parsed.inspectionId,
      structural_element_id: parsed.structuralElementId ?? null,
      test_date: parsed.testDate ?? new Date().toISOString().slice(0, 10),
      impact_direction: parsed.impactDirection,
      instrument_serial: parsed.instrumentSerial ?? null,
      readings_count: summary.readingsCount,
      outlier_count: summary.outlierCount,
      mean_rebound: summary.meanRebound,
      corrected_rebound: summary.correctedRebound,
      estimated_strength_mpa: summary.estimatedStrengthMpa,
      correlation_reference: summary.correlationReference,
      performed_by: userId,
      notes: parsed.notes,
    })
    .select()
    .single()

  if (error || !test) throw error ?? new Error('Failed to create rebound test')

  const readingRows = parsed.readings.map((value, index) => ({
    test_id: test.id,
    reading_index: index + 1,
    rebound_value: Math.round(value),
    is_outlier: summary.outlierValues.includes(value),
  }))

  const { error: readingsError } = await supabase.from('rebound_readings').insert(readingRows)
  if (readingsError) {
    // Roll the parent test back so a partial test cannot be read as complete.
    await supabase.from('rebound_tests').delete().eq('id', test.id)
    throw readingsError
  }

  await recordAuditEvent({
    action: 'rebound_test.create',
    entityType: 'rebound_test',
    entityId: test.id,
    after: {
      readings: summary.readingsCount,
      outliers: summary.outlierCount,
      mean: summary.meanRebound,
      estimatedStrengthMpa: summary.estimatedStrengthMpa,
    },
  })

  return test as ReboundTest
}

export async function getReboundTestsForInspection(inspectionId: string): Promise<ReboundTest[]> {
  const parsedId = uuid.parse(inspectionId)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('rebound_tests')
    .select('*, readings:rebound_readings(*)')
    .eq('inspection_id', parsedId)
    .order('test_date', { ascending: false })

  if (error) throw error
  return (data || []) as ReboundTest[]
}

// -----------------------------------------------------------------
// A2. Crack taxonomy on a detection
// -----------------------------------------------------------------

const crackUpdateSchema = z
  .object({
    detectionId: uuid,
    widthMm: z.number().min(0).max(1000).nullish(),
    orientation: z
      .enum(['vertical', 'horizontal', 'diagonal', 'stepped', 'map_cracking', 'none'])
      .nullish(),
    pattern: z.enum(['single', 'multiple', 'parallel', 'random', 'none']).nullish(),
    cause: z
      .enum(['settlement', 'shrinkage', 'thermal', 'overload', 'corrosion_induced', 'unknown', 'none'])
      .nullish(),
    exposure: z.enum(['dry_air', 'humid', 'deicing_chemicals', 'water_retaining', 'seawater']).default('humid'),
  })
  .strict()

/**
 * Record the engineer's crack classification.
 *
 * The width band and ACI reference are computed here from the measured width —
 * they are never accepted from the client, and a caller cannot claim a band that
 * contradicts the measurement.
 */
export async function updateDetectionCrackTaxonomy(
  input: z.input<typeof crackUpdateSchema>
): Promise<Record<string, unknown>> {
  await requireRole(['engineer', 'admin'])
  const parsed = crackUpdateSchema.parse(input)
  const supabase = await createClient()

  const updates: Record<string, unknown> = {
    crack_orientation: parsed.orientation ?? null,
    crack_pattern: parsed.pattern ?? null,
    crack_cause: parsed.cause ?? null,
  }

  if (parsed.widthMm != null) {
    const assessment = assessCrack(parsed.widthMm, parsed.exposure)
    updates.crack_width_mm = parsed.widthMm
    updates.crack_width_band = assessment.band
    updates.aci_reference = assessment.reference
  } else {
    updates.crack_width_mm = null
    updates.crack_width_band = null
    updates.aci_reference = null
  }

  const { data, error } = await supabase
    .from('ai_damage_detections')
    .update(updates)
    .eq('id', parsed.detectionId)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to update crack taxonomy')

  await recordAuditEvent({
    action: 'detection.crack_taxonomy.update',
    entityType: 'ai_damage_detection',
    entityId: parsed.detectionId,
    after: updates,
  })

  return data as Record<string, unknown>
}

// -----------------------------------------------------------------
// B2. Soil investigation
// -----------------------------------------------------------------

const soilSchema = z
  .object({
    projectId: uuid.nullish(),
    buildingId: uuid.nullish(),
    boreholeId: z.string().min(1).max(120),
    depthM: z.number().min(0).max(200).nullish(),
    soilClassification: z.string().max(200).nullish(),
    sptNValue: z.number().int().min(0).max(200).nullish(),
    groundwaterDepthM: z.number().min(0).max(200).nullish(),
    liquefactionSusceptibility: z.enum(['none', 'low', 'moderate', 'high', 'unknown']).default('unknown'),
    investigationDate: isoDate.optional(),
    source: z.enum(['field', 'laboratory', 'third_party', 'desk_study']).default('field'),
    notes: z.string().max(4000).default(''),
  })
  .strict()
  .refine((value) => Boolean(value.projectId || value.buildingId), {
    message: 'A soil investigation must belong to a project or a building.',
  })

export async function createSoilInvestigation(
  input: z.input<typeof soilSchema>
): Promise<SoilInvestigation> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = soilSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('soil_investigations')
    .insert({
      project_id: parsed.projectId ?? null,
      building_id: parsed.buildingId ?? null,
      borehole_id: parsed.boreholeId,
      depth_m: parsed.depthM ?? null,
      soil_classification: parsed.soilClassification ?? null,
      spt_n_value: parsed.sptNValue ?? null,
      groundwater_depth_m: parsed.groundwaterDepthM ?? null,
      liquefaction_susceptibility: parsed.liquefactionSusceptibility,
      investigation_date: parsed.investigationDate ?? new Date().toISOString().slice(0, 10),
      source: parsed.source,
      notes: parsed.notes,
      recorded_by: userId,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create soil investigation')

  await recordAuditEvent({
    action: 'soil_investigation.create',
    entityType: 'soil_investigation',
    entityId: data.id,
    after: { borehole: parsed.boreholeId, spt: parsed.sptNValue },
  })

  return data as SoilInvestigation
}

export async function getSoilInvestigations(params: {
  projectId?: string
  buildingId?: string
}): Promise<SoilInvestigation[]> {
  const supabase = await createClient()
  let query = supabase.from('soil_investigations').select('*')

  if (params.buildingId) {
    query = query.eq('building_id', uuid.parse(params.buildingId))
  } else if (params.projectId) {
    query = query.eq('project_id', uuid.parse(params.projectId))
  } else {
    throw new Error('Provide a projectId or a buildingId.')
  }

  const { data, error } = await query
    .order('investigation_date', { ascending: false })
    .limit(200)

  if (error) throw error
  return (data || []) as SoilInvestigation[]
}

// -----------------------------------------------------------------
// B3 + inspection editing
// -----------------------------------------------------------------

const inspectionUpdateSchema = z
  .object({
    inspectionId: uuid,
    inspectionDate: isoDate.optional(),
    status: z.enum(['pending', 'in_progress', 'completed', 'requires_followup']).optional(),
    location: z.string().max(500).optional(),
    notes: z.string().max(10_000).optional(),
    buildingId: uuid.nullish(),
    floorId: uuid.nullish(),
    structuralElementId: uuid.nullish(),
    erosionCondition: z.enum(['none', 'minor', 'moderate', 'severe']).nullish(),
    erosionType: z.enum(['surface', 'gully', 'coastal', 'riverbank', 'internal', 'other']).nullish(),
    erosionNotes: z.string().max(4000).nullish(),
    reopen: z.boolean().default(false),
  })
  .strict()

export async function updateInspectionRecord(
  input: z.input<typeof inspectionUpdateSchema>
): Promise<ActionResult<Inspection>> {
  const { userId, role } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = inspectionUpdateSchema.parse(input)
  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', parsed.inspectionId)
    .single()

  if (readError || !existing) return actionRefuse('Inspection not found')

  if (role === 'inspector') {
    if (existing.lead_inspector_id !== userId) {
      return actionRefuse('Access denied: inspectors may only edit their own inspections.')
    }
    if (existing.status === 'completed') {
      return actionRefuse('This inspection is completed. An engineer or admin must reopen it first.')
    }
  }

  if (existing.status === 'completed' && !parsed.reopen) {
    return actionRefuse('Completed inspections are locked. Set reopen to edit them.')
  }

  const buildingId = parsed.buildingId === undefined ? existing.building_id : parsed.buildingId
  const floorId = parsed.floorId === undefined ? existing.floor_id : parsed.floorId
  const elementId = parsed.structuralElementId === undefined ? existing.structural_element_id : parsed.structuralElementId
  let floorName: string | undefined
  let elementType: string | undefined
  if (floorId && !buildingId) return actionRefuse('Link a building before selecting a floor.')
  if (elementId && !floorId) return actionRefuse('Link a floor before selecting a structural element.')
  if (buildingId) {
    const { data: building, error: buildingError } = await supabase.from('buildings').select('project_id').eq('id', buildingId).single()
    if (buildingError || !building || building.project_id !== existing.project_id) return actionRefuse('The building must belong to this inspection project.')
  }
  if (floorId) {
    const { data: floor, error: floorError } = await supabase.from('floors').select('building_id, name').eq('id', floorId).single()
    if (floorError || !floor || floor.building_id !== buildingId) return actionRefuse('The floor must belong to the selected building.')
    floorName = floor.name
  }
  if (elementId) {
    const { data: element, error: elementError } = await supabase.from('structural_elements').select('floor_id, element_type').eq('id', elementId).single()
    if (elementError || !element || element.floor_id !== floorId) return actionRefuse('The structural element must belong to the selected floor.')
    elementType = element.element_type
  }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.floorId !== undefined) updates.floor = floorName ?? 'Unspecified'
  if (parsed.structuralElementId !== undefined) updates.structural_element = elementType ?? 'general'
  if (parsed.inspectionDate !== undefined) updates.inspection_date = parsed.inspectionDate
  if (parsed.status !== undefined) updates.status = parsed.status
  if (parsed.location !== undefined) updates.location = parsed.location
  if (parsed.notes !== undefined) updates.notes = parsed.notes
  if (parsed.buildingId !== undefined) updates.building_id = parsed.buildingId
  if (parsed.floorId !== undefined) updates.floor_id = parsed.floorId
  if (parsed.structuralElementId !== undefined) updates.structural_element_id = parsed.structuralElementId
  if (parsed.erosionCondition !== undefined) updates.erosion_condition = parsed.erosionCondition
  if (parsed.erosionType !== undefined) updates.erosion_type = parsed.erosionType
  if (parsed.erosionNotes !== undefined) updates.erosion_notes = parsed.erosionNotes

  if (parsed.reopen && existing.status === 'completed') {
    if (parsed.status == null || parsed.status === 'completed') updates.status = 'in_progress'
    updates.reopened_at = new Date().toISOString()
    updates.reopened_by = userId
  }

  const { data: updated, error } = await supabase
    .from('inspections')
    .update(updates)
    .eq('id', parsed.inspectionId)
    .select()
    .single()

  if (error || !updated) throw error ?? new Error('Failed to update inspection')

  await recordAuditEvent({
    action: parsed.reopen ? 'inspection.reopen_and_update' : 'inspection.update',
    entityType: 'inspection',
    entityId: parsed.inspectionId,
    before: existing as Record<string, unknown>,
    after: updates,
  })

  return actionOk(updated as Inspection)
}

// -----------------------------------------------------------------
// B4. Forensic engineering
// -----------------------------------------------------------------

const forensicSchema = z
  .object({
    inspectionId: uuid,
    reportId: uuid.nullish(),
    failureHypothesis: z
      .enum(['material', 'design', 'construction', 'overload', 'settlement', 'deterioration', 'other', 'unknown'])
      .default('unknown'),
    mechanismNarrative: z.string().max(10_000).nullish(),
    conclusion: z.string().max(10_000).nullish(),
    recommendedNextStep: z.string().max(4000).nullish(),
  })
  .strict()

export async function createForensicAssessment(
  input: z.input<typeof forensicSchema>
): Promise<ForensicAssessment> {
  const { userId } = await requireRole(['engineer', 'admin'])
  const parsed = forensicSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('forensic_assessments')
    .insert({
      inspection_id: parsed.inspectionId,
      report_id: parsed.reportId ?? null,
      failure_hypothesis: parsed.failureHypothesis,
      mechanism_narrative: parsed.mechanismNarrative ?? null,
      conclusion: parsed.conclusion ?? null,
      recommended_next_step: parsed.recommendedNextStep ?? null,
      author_id: userId,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create forensic assessment')

  await recordAuditEvent({
    action: 'forensic_assessment.create',
    entityType: 'forensic_assessment',
    entityId: data.id,
    after: { hypothesis: parsed.failureHypothesis },
  })

  return data as ForensicAssessment
}

const evidenceSchema = z
  .object({
    assessmentId: uuid,
    imageId: uuid.nullish(),
    detectionId: uuid.nullish(),
    note: z.string().max(2000).nullish(),
  })
  .strict()
  .refine((value) => Boolean(value.imageId || value.detectionId), {
    message: 'Evidence must reference an image or a detection.',
  })

export async function addForensicEvidence(
  input: z.input<typeof evidenceSchema>
): Promise<ForensicEvidence> {
  await requireRole(['engineer', 'admin'])
  const parsed = evidenceSchema.parse(input)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('forensic_evidence')
    .insert({
      assessment_id: parsed.assessmentId,
      image_id: parsed.imageId ?? null,
      detection_id: parsed.detectionId ?? null,
      note: parsed.note ?? null,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to add forensic evidence')
  return data as ForensicEvidence
}

export async function getForensicAssessments(inspectionId: string): Promise<ForensicAssessment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('forensic_assessments')
    .select('*, evidence:forensic_evidence(*)')
    .eq('inspection_id', uuid.parse(inspectionId))
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []) as ForensicAssessment[]
}

// -----------------------------------------------------------------
// A8. Checklists
// -----------------------------------------------------------------

export async function getChecklistTemplates(): Promise<ChecklistTemplate[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('is_active', true)
    .order('code')

  if (error) throw error
  return (data || []) as ChecklistTemplate[]
}

const checklistResponseItemSchema = z
  .object({
    key: z.string().min(1).max(80),
    answer: z.enum(['yes', 'no', 'na']).nullable(),
    note: z.string().max(1000).optional(),
    prefilled: z.boolean().optional(),
  })
  .strict()

const checklistSaveSchema = z
  .object({
    inspectionId: uuid,
    templateCode: z.string().min(1).max(80),
    responses: z.array(checklistResponseItemSchema).max(100),
  })
  .strict()

export async function saveChecklistResponse(
  input: z.input<typeof checklistSaveSchema>
): Promise<ChecklistResponse> {
  const { userId } = await requireRole(['inspector', 'engineer', 'admin'])
  const parsed = checklistSaveSchema.parse(input)
  const supabase = await createClient()

  const { data: template, error: templateError } = await supabase
    .from('checklist_templates')
    .select('code, version, items')
    .eq('code', parsed.templateCode)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (templateError) throw templateError
  if (!template) throw new Error(`No active checklist template for '${parsed.templateCode}'.`)

  const keys = z.array(z.object({ key: z.string() }).passthrough()).parse(template.items).map((item) => item.key)
  const suppliedKeys = parsed.responses.map((item) => item.key)
  if (new Set(suppliedKeys).size !== suppliedKeys.length || suppliedKeys.length !== keys.length || keys.some((key) => !suppliedKeys.includes(key))) {
    throw new Error('Checklist responses must match every item in the active template exactly, without duplicates.')
  }
  if (parsed.responses.some((item) => item.answer == null || item.prefilled === true)) {
    throw new Error('Confirm or override every prefilled answer, and complete each checklist item before saving.')
  }

  const { data, error } = await supabase
    .from('checklist_responses')
    .upsert(
      {
        inspection_id: parsed.inspectionId,
        template_code: template.code,
        template_version: template.version,
        responses: parsed.responses as ChecklistResponseItem[],
        completed_by: userId,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'inspection_id,template_code' }
    )
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to save checklist response')

  await recordAuditEvent({
    action: 'checklist.save',
    entityType: 'checklist_response',
    entityId: data.id,
    after: { template: template.code, version: template.version, items: parsed.responses.length },
  })

  return data as ChecklistResponse
}

export async function getChecklistResponses(inspectionId: string): Promise<ChecklistResponse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('checklist_responses')
    .select('*')
    .eq('inspection_id', uuid.parse(inspectionId))
    .order('template_code')

  if (error) throw error
  return (data || []) as ChecklistResponse[]
}


/** Spatial suggestions only. Dataset absence stays unknown until field confirmation. */
export async function getChecklistSuggestions(inspectionId: string): Promise<Record<string, boolean | null>> {
  const { userId, role } = await requireRole(['inspector', 'engineer', 'admin'])
  const supabase = await createClient()
  const { data: inspection, error } = await supabase.from('inspections')
    .select('project_id, lead_inspector_id').eq('id', uuid.parse(inspectionId)).single()
  if (error || !inspection) throw new Error('Inspection context is unavailable')
  if (role === 'inspector' && inspection.lead_inspector_id !== userId) throw new Error('Access denied to inspection')
  const context = await computeProjectEnvironmentalRisk(inspection.project_id)
  const value = (type: string) => context.coverage.includes(type) ? context.memberships[type] ?? false : null
  return {
    flood_zone_membership: value('flood'),
    liquefaction_zone_membership: value('liquefaction'),
    erosion_zone_membership: value('erosion'),
    landslide_zone_membership: value('landslide'),
    fault_line_proximity: context.nearestFaultDistanceKm == null ? null : context.nearestFaultDistanceKm < 5,
  }
}

export interface SettlementOverview {
  building_id: string
  building_name: string
  project_id: string
  latitude: number | null
  longitude: number | null
  inspection_id: string | null
  observed_at: string
  classification: 'none' | 'monitor' | 'action_required'
  tilt_mm_per_m: number | null
  differential_settlement_mm: number | null
}

/** One latest reading per building; missing coordinates stay missing on maps. */
export async function getSettlementOverview(projectId?: string): Promise<SettlementOverview[]> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('settlement_overview', { p_project_id: projectId ? uuid.parse(projectId) : null })
  if (error) throw new Error(`Movement overview unavailable: ${error.message}`)
  return z.array(z.object({
    building_id: uuid, building_name: z.string(), project_id: uuid,
    latitude: z.coerce.number().nullable(), longitude: z.coerce.number().nullable(),
    inspection_id: uuid.nullable(), observed_at: z.string(),
    classification: z.enum(['none', 'monitor', 'action_required']),
    tilt_mm_per_m: z.coerce.number().nullable(), differential_settlement_mm: z.coerce.number().nullable(),
  })).parse(data ?? [])
}
