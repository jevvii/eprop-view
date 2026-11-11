import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Demo dataset for the preview environment.
 *
 * Everything here exists so the capstone v2 surfaces have something real to show:
 * a building with movement readings, field tests, ground conditions, checklists,
 * detections that can be classified, and a report with a signed recommendation.
 *
 * Idempotent: if the demo project already exists the function reports that and
 * writes nothing. It never deletes anything.
 */

export const DEMO_PROJECT_NAME = 'Northgate Riverside Complex'

export interface SeedResult {
  seeded: boolean
  reason?: string
  counts: Record<string, number>
}

function isoDaysAgo(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function isoDaysAhead(days: number): string {
  return isoDaysAgo(-days)
}

async function generatePlaceholderJpeg(label: string, shade: number): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640">
    <rect width="900" height="640" fill="rgb(${shade},${shade},${shade + 4})"/>
    <g stroke="rgba(30,41,59,0.10)" stroke-width="1">
      ${Array.from({ length: 12 }, (_, index) => `<line x1="0" y1="${index * 54}" x2="900" y2="${index * 54}"/>`).join('')}
      ${Array.from({ length: 16 }, (_, index) => `<line x1="${index * 58}" y1="0" x2="${index * 58}" y2="640"/>`).join('')}
    </g>
    <path d="M 240 120 L 300 320 L 270 470 L 360 560" stroke="rgba(20,25,30,0.55)" stroke-width="7" fill="none"/>
    <path d="M 420 300 L 610 340" stroke="rgba(20,25,30,0.35)" stroke-width="4" fill="none"/>
    <text x="36" y="60" font-family="monospace" font-size="26" fill="rgba(30,41,59,0.65)">${label}</text>
    <text x="36" y="96" font-family="monospace" font-size="16" fill="rgba(30,41,59,0.45)">DEMO IMAGE — not a real inspection</text>
  </svg>`

  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

export async function seedDemoData(supabase: SupabaseClient): Promise<SeedResult> {
  const counts: Record<string, number> = {}

  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('name', DEMO_PROJECT_NAME)
    .maybeSingle()

  if (existing) {
    return {
      seeded: false,
      reason: `"${DEMO_PROJECT_NAME}" already exists, so nothing was written. Remove that project first if you want a fresh seed.`,
      counts,
    }
  }

  const { data: staff } = await supabase.from('profiles').select('id, role')
  const engineerId = staff?.find((row) => row.role === 'engineer')?.id ?? null
  const inspectorId = staff?.find((row) => row.role === 'inspector')?.id ?? null
  const adminId = staff?.find((row) => row.role === 'admin')?.id ?? null
  const actor = adminId ?? engineerId ?? inspectorId ?? null

  // 1. Project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      name: DEMO_PROJECT_NAME,
      location: 'Marikina City, Metro Manila',
      description:
        'Mixed-use low-rise complex beside the Marikina River. Demo site used to populate the preview environment.',
      status: 'active',
      geom: 'SRID=4326;POINT(121.0945 14.6507)',
      created_by: actor,
    })
    .select('id')
    .single()

  if (projectError || !project) throw projectError ?? new Error('Could not create the demo project')
  counts.projects = 1

  // 2. Building hierarchy
  const { data: building, error: buildingError } = await supabase
    .from('buildings')
    .insert({
      project_id: project.id,
      name: 'Riverside Block A',
      code: 'RBA',
      description: 'Four-storey reinforced concrete frame, built 1998.',
      latitude: 14.6507,
      longitude: 121.0945,
    })
    .select('id')
    .single()

  if (buildingError || !building) throw buildingError ?? new Error('Could not create the demo building')

  const { data: floors } = await supabase
    .from('floors')
    .insert([
      { building_id: building.id, name: 'Ground Floor', level: 1, sort_order: 1 },
      { building_id: building.id, name: 'Second Floor', level: 2, sort_order: 2 },
    ])
    .select('id, name')

  const groundFloor = floors?.find((floor) => floor.name === 'Ground Floor')?.id ?? null
  const secondFloor = floors?.find((floor) => floor.name === 'Second Floor')?.id ?? null

  const { data: elements } = await supabase
    .from('structural_elements')
    .insert([
      { floor_id: groundFloor, element_type: 'column', identifier: 'C1-GF', description: 'Perimeter column, north-east corner' },
      { floor_id: groundFloor, element_type: 'beam', identifier: 'B3-GF', description: 'Transfer beam over the lobby' },
      { floor_id: secondFloor, element_type: 'slab', identifier: 'S1-2F', description: 'Suspended slab, unit 2B' },
      { floor_id: groundFloor, element_type: 'foundation', identifier: 'F-GF', description: 'Isolated footing, column C1' },
    ])
    .select('id, identifier')

  const columnId = elements?.find((element) => element.identifier === 'C1-GF')?.id ?? null
  const slabId = elements?.find((element) => element.identifier === 'S1-2F')?.id ?? null

  // 3. Inspections
  const { data: inspections, error: inspectionError } = await supabase
    .from('inspections')
    .insert([
      {
        project_id: project.id,
        lead_inspector_id: inspectorId,
        inspection_date: isoDaysAgo(64),
        status: 'completed',
        risk_score: 4.2,
        risk_level: 'moderate',
        location: 'Riverside Block A — ground floor',
        notes: 'Baseline visual survey after the 2026 floods.',
        building_id: building.id,
        floor_id: groundFloor,
        structural_element_id: columnId,
        erosion_condition: 'minor',
        erosion_type: 'surface',
        erosion_notes: 'Shallow surface loss at the river-facing plinth; no exposed reinforcement.',
      },
      {
        project_id: project.id,
        lead_inspector_id: inspectorId,
        inspection_date: isoDaysAgo(21),
        status: 'completed',
        risk_score: 6.8,
        risk_level: 'high',
        location: 'Riverside Block A — second floor',
        notes: 'Follow-up after occupants reported a new diagonal crack in unit 2B.',
        building_id: building.id,
        floor_id: secondFloor,
        structural_element_id: slabId,
        erosion_condition: 'moderate',
        erosion_type: 'gully',
        erosion_notes: 'Gully forming along the north drainage line, roughly 0.4 m deep.',
      },
      {
        project_id: project.id,
        lead_inspector_id: inspectorId,
        inspection_date: isoDaysAgo(5),
        status: 'in_progress',
        risk_score: 7.6,
        risk_level: 'high',
        location: 'Riverside Block A — ground floor column C1',
        notes: 'Crack monitoring installed; revisit scheduled.',
        building_id: building.id,
        floor_id: groundFloor,
        structural_element_id: columnId,
      },
    ])
    .select('id, inspection_date')

  if (inspectionError || !inspections) throw inspectionError ?? new Error('Could not create demo inspections')
  counts.inspections = inspections.length

  const oldInspection = inspections[0].id
  const recentInspection = inspections[1].id
  const openInspection = inspections[2].id

  // 4. Images and detections
  const { data: model } = await supabase
    .from('ai_models')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const imageSpecs = [
    { inspectionId: recentInspection, caption: 'Diagonal crack, unit 2B slab', shade: 168 },
    { inspectionId: recentInspection, caption: 'Column C1, hairline map cracking', shade: 176 },
    { inspectionId: oldInspection, caption: 'Plinth erosion, river elevation', shade: 160 },
  ]

  const imageIds: string[] = []
  let imagesWritten = 0

  for (const [index, spec] of imageSpecs.entries()) {
    const buffer = await generatePlaceholderJpeg(spec.caption, spec.shade)
    const storagePath = `${spec.inspectionId}/demo/${crypto.randomUUID()}.jpg`

    const { error: uploadError } = await supabase.storage
      .from('inspection-images')
      .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: false })

    if (uploadError) {
      // A missing bucket or storage policy must not abort the rest of the seed.
      counts.storageSkipped = (counts.storageSkipped ?? 0) + 1
      continue
    }

    const { data: image, error: imageError } = await supabase
      .from('inspection_images')
      .insert({
        inspection_id: spec.inspectionId,
        storage_path: storagePath,
        caption: spec.caption,
        uploader_id: inspectorId,
      })
      .select('id')
      .single()

    if (imageError || !image) continue

    imageIds[index] = image.id
    imagesWritten++
  }

  counts.images = imagesWritten

  const detectionSeeds = [
    {
      imageIndex: 0,
      damage_type: 'crack',
      severity: 'high',
      severity_score: 74,
      confidence: 0.82,
      bbox: { x: 0.22, y: 0.16, width: 0.3, height: 0.66 },
      provenance: 'heuristic',
      notes: 'Diagonal crack crossing the slab soffit, wider at the support.',
      crack_width_mm: 1.6,
      crack_width_band: 'wide',
      crack_orientation: 'diagonal',
      crack_pattern: 'single',
      crack_cause: 'settlement',
      aci_reference: 'ACI 224R-01 §4.1 (Humid air, moist ground; limit 0.15 mm)',
    },
    {
      imageIndex: 1,
      damage_type: 'crack',
      severity: 'medium',
      severity_score: 48,
      confidence: 0.71,
      bbox: { x: 0.18, y: 0.2, width: 0.42, height: 0.5 },
      provenance: 'heuristic',
      notes: 'Map cracking across the column face, consistent with shrinkage and carbonation.',
      crack_width_mm: 0.22,
      crack_width_band: 'fine',
      crack_orientation: 'map_cracking',
      crack_pattern: 'random',
      crack_cause: 'shrinkage',
      aci_reference: 'ACI 224R-01 §4.1 (Humid air, moist ground; limit 0.15 mm)',
    },
    {
      imageIndex: 2,
      damage_type: 'spalling',
      severity: 'medium',
      severity_score: 38,
      confidence: 0.63,
      bbox: { x: 0.3, y: 0.55, width: 0.34, height: 0.28 },
      provenance: 'heuristic',
      notes: 'Surface spalling at the plinth where erosion has removed cover.',
    },
  ]

  const detectionRows = detectionSeeds
    .filter((seed) => Boolean(imageIds[seed.imageIndex]))
    .map(({ imageIndex, ...row }) => ({
      ...row,
      image_id: imageIds[imageIndex],
      model_id: model?.id ?? null,
    }))

  let detectionIds: string[] = []

  if (detectionRows.length > 0) {
    const { data: detections } = await supabase
      .from('ai_damage_detections')
      .insert(detectionRows)
      .select('id, damage_type')
    detectionIds = (detections ?? []).map((row) => row.id)
    counts.detections = detectionIds.length
  }

  // 5. Movement readings
  const { error: settlementError } = await supabase.from('settlement_observations').insert([
    {
      building_id: building.id,
      inspection_id: oldInspection,
      tilt_mm_per_m: 0.9,
      differential_settlement_mm: 6,
      classification: 'none',
      measurement_method: 'level',
      notes: 'Baseline reading at the north-east corner.',
      recorded_by: inspectorId,
    },
    {
      building_id: building.id,
      inspection_id: recentInspection,
      tilt_mm_per_m: 2.6,
      differential_settlement_mm: 14,
      classification: 'monitor',
      measurement_method: 'level',
      notes: 'Movement since baseline; crack monitoring plates installed at column C1.',
      recorded_by: inspectorId,
    },
  ])
  if (!settlementError) counts.settlement = 2

  // 6. Rebound test
  const readings = [38, 39, 37, 40, 39, 41, 38, 40, 39, 58]
  const { data: reboundTest } = await supabase
    .from('rebound_tests')
    .insert({
      inspection_id: recentInspection,
      structural_element_id: columnId,
      test_date: isoDaysAgo(20),
      impact_direction: 'horizontal',
      instrument_serial: 'SCH-DEMO-01',
      readings_count: readings.length,
      outlier_count: 1,
      mean_rebound: 39.13,
      corrected_rebound: 39.13,
      estimated_strength_mpa: 31.33,
      correlation_reference: 'Indicative linear correlation f′c ≈ 1.35R − 21.5 MPa (requires site-specific calibration)',
      performed_by: inspectorId,
      notes: 'One reading discarded as an outlier by the interquartile rule.',
    })
    .select('id')
    .single()

  if (reboundTest) {
    await supabase.from('rebound_readings').insert(
      readings.map((value, index) => ({
        test_id: reboundTest.id,
        reading_index: index + 1,
        rebound_value: value,
        is_outlier: value === 58,
      }))
    )
    counts.rebound = 1
  }

  // 7. Soil investigation
  const { error: soilError } = await supabase.from('soil_investigations').insert([
    {
      project_id: project.id,
      building_id: building.id,
      borehole_id: 'BH-01',
      depth_m: 6,
      soil_classification: 'Silty clay (CL)',
      spt_n_value: 12,
      groundwater_depth_m: 2.4,
      liquefaction_susceptibility: 'moderate',
      investigation_date: isoDaysAgo(120),
      source: 'field',
      notes: 'Groundwater shallow; liquefaction susceptibility taken from the regional hazard map.',
      recorded_by: engineerId,
    },
    {
      project_id: project.id,
      building_id: building.id,
      borehole_id: 'BH-02',
      depth_m: 8,
      soil_classification: 'Loose sandy silt (ML)',
      spt_n_value: 7,
      groundwater_depth_m: 2.1,
      liquefaction_susceptibility: 'high',
      investigation_date: isoDaysAgo(118),
      source: 'laboratory',
      notes: 'Lower SPT counts near the river bank.',
      recorded_by: engineerId,
    },
  ])
  if (!soilError) counts.soil = 2

  // 8. Forensic assessment
  const { error: forensicError } = await supabase.from('forensic_assessments').insert({
    inspection_id: recentInspection,
    failure_hypothesis: 'settlement',
    mechanism_narrative:
      'The diagonal crack in unit 2B widens toward the north-east support, which is consistent with differential movement of the footing at column C1 rather than with slab overloading. The crack path follows the principal tension direction implied by that movement.',
    conclusion:
      'Movement is ongoing. The measured tilt has risen from 0.9 to 2.6 mm/m since baseline, crossing the monitoring threshold.',
    recommended_next_step: 'Level survey at 30-day intervals and a geotechnical review of the C1 footing.',
    author_id: engineerId,
  })
  if (!forensicError) counts.forensic = 1

  // 9. Checklist responses
  const { data: templates } = await supabase
    .from('checklist_templates')
    .select('code, version, items')
    .eq('is_active', true)

  if (templates && templates.length > 0) {
    const rows = templates.map((template) => ({
      inspection_id: recentInspection,
      template_code: template.code,
      template_version: template.version,
      responses: (template.items as { key: string }[]).map((item, index) => ({
        key: item.key,
        answer: index < 3 ? 'yes' : index < 5 ? 'no' : 'na',
        prefilled: index < 2,
        note: index < 2 ? 'Suggested from the project’s mapped hazard layer.' : undefined,
      })),
      prefilled_from: 'geospatial_zones',
      completed_by: inspectorId,
      completed_at: new Date().toISOString(),
    }))

    const { error: checklistError } = await supabase.from('checklist_responses').insert(rows)
    if (!checklistError) counts.checklists = rows.length
  }

  // 10. Reports, limitations, revisions, recommendations
  const { data: reports } = await supabase
    .from('reports')
    .insert([
      {
        report_id: 'RPT-2026-DEMO-01',
        title: 'Riverside Block A — Baseline condition survey',
        project_id: project.id,
        inspection_id: oldInspection,
        date: isoDaysAgo(60),
        location: 'Riverside Block A',
        status: 'completed',
        lead_inspector_id: inspectorId,
        risk_score: 4.2,
        key_findings:
          'Cracking is limited to hairline shrinkage patterns. Surface erosion at the river plinth removed cover locally but exposed no reinforcement.',
        created_by: engineerId,
        reviewed_by: engineerId,
        reviewed_at: new Date().toISOString(),
      },
      {
        report_id: 'RPT-2026-DEMO-02',
        title: 'Riverside Block A — Follow-up structural review',
        project_id: project.id,
        inspection_id: recentInspection,
        date: isoDaysAgo(18),
        location: 'Riverside Block A — unit 2B',
        status: 'in_review',
        lead_inspector_id: inspectorId,
        risk_score: 6.8,
        key_findings:
          'A diagonal crack 1.6 mm wide crosses the unit 2B slab soffit. Tilt has increased to 2.6 mm/m. The pattern and direction point to foundation movement rather than slab overload.',
        created_by: engineerId,
      },
    ])
    .select('id, report_id')

  if (reports && reports.length === 2) {
    counts.reports = 2
    const followUp = reports[1]

    await supabase.from('report_limitations').insert({
      report_id: followUp.id,
      standard_exclusions: [
        'Visual assessment only; no destructive or laboratory testing performed',
        'No foundation exposure or excavation undertaken',
        'Inaccessible or concealed areas were not inspected',
        'No load testing was performed',
        'Findings reflect conditions observed on the inspection date only',
      ],
      free_text:
        'The footing at column C1 could not be exposed. The movement assessment relies on surface measurement only.',
      element_notes: { 'C1-GF': 'Cover depth not verified on site.' },
      created_by: engineerId,
    })

    await supabase.from('recommendations').insert({
      report_id: followUp.id,
      inspection_id: recentInspection,
      draft_text:
        'Investigate the foundation at column C1 and install a monitoring regime before further occupancy loading.',
      final_text:
        'Commission a geotechnical review of the C1 footing and continue level surveys at 30-day intervals. Restrict storage loading on the unit 2B slab until movement stabilises.',
      status: 'signed',
      provenance: 'gemini',
      signed_by: engineerId,
      signed_at: new Date().toISOString(),
    })
    counts.recommendations = 1

    const { data: estimate } = await supabase
      .from('cost_estimates')
      .insert({
        inspection_id: recentInspection,
        detection_id: detectionIds[0] ?? null,
        report_id: followUp.id,
        ai_low_php: 180000,
        ai_likely_php: 260000,
        ai_high_php: 420000,
        ai_basis: 'Assumes crack injection plus local slab repair, with no foundation work.',
        ai_confidence: 0.62,
        table_estimate_php: 250000,
        divergence_flag: false,
        provenance: 'gemini',
        confirmed_by: engineerId,
        confirmed_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

    if (estimate) counts.costEstimates = 1

    await supabase.from('report_revisions').insert({
      report_id: followUp.id,
      revision_number: 1,
      snapshot: {
        title: 'Riverside Block A — Follow-up structural review (draft)',
        status: 'open',
        risk_score: 5.4,
        key_findings: 'Initial observation of cracking in unit 2B before measurement.',
      },
      changed_by: engineerId,
    })
    counts.reportRevisions = 1
  }

  // 11. Maintenance, trends, hotspots, environmental risk
  const { error: maintenanceError } = await supabase.from('maintenance_priorities').insert([
    {
      project_id: project.id,
      title: 'Geotechnical review — column C1 footing',
      location: 'Riverside Block A, ground floor',
      risk_score: 8.4,
      status: 'in_progress',
      assigned_to: engineerId,
      due_date: isoDaysAhead(14),
      notes: 'Triggered by the signed recommendation on RPT-2026-DEMO-02.',
    },
    {
      project_id: project.id,
      title: 'Repair the north drainage gully',
      location: 'River elevation, north face',
      risk_score: 5.1,
      status: 'pending',
      assigned_to: null,
      due_date: isoDaysAhead(45),
      notes: 'Erosion is undermining the plinth at the north-east corner.',
    },
    {
      project_id: project.id,
      title: 'Crack injection — unit 2B slab',
      location: 'Riverside Block A, second floor',
      risk_score: 6.2,
      status: 'deferred',
      assigned_to: engineerId,
      due_date: isoDaysAhead(90),
      notes: 'Hold until movement stabilises.',
    },
  ])
  if (!maintenanceError) counts.maintenance = 3

  await supabase.from('damage_trends').insert(
    [4, 5, 5, 6, 7, 7, 8].map((value, index) => ({
      project_id: project.id,
      date: isoDaysAgo(180 - index * 25),
      severity: value >= 8 ? 'critical' : value >= 6 ? 'high' : 'moderate',
      value,
    }))
  )
  counts.trends = 7

  await supabase.from('risk_hotspots').insert([
    {
      project_id: project.id,
      title: 'Column C1 footing movement',
      severity: 'critical',
      description: 'Tilt rising since baseline; crack widens toward this support.',
      position_x: 62,
      position_y: 38,
      geom: 'SRID=4326;POINT(121.0951 14.6511)',
    },
    {
      project_id: project.id,
      title: 'North drainage gully',
      severity: 'moderate',
      description: 'Erosion is removing cover at the river-facing plinth.',
      position_x: 41,
      position_y: 55,
      geom: 'SRID=4326;POINT(121.0938 14.6504)',
    },
    {
      project_id: project.id,
      title: 'Unit 2B slab cracking',
      severity: 'moderate',
      description: 'Diagonal crack across the soffit, monitored.',
      position_x: 55,
      position_y: 47,
      geom: 'SRID=4326;POINT(121.0947 14.6508)',
    },
  ])
  counts.hotspots = 3

  const { error: environmentalError } = await supabase.from('environmental_risks').insert({
    project_id: project.id,
    fault_line_proximity: 'low',
    soil_liquefaction_risk: 'zone_b',
    erosion_potential: 'moderate',
    overall_risk_score: 6.1,
    additional_analysis:
      'Shallow groundwater and loose sandy silt near the river bank raise liquefaction susceptibility. Erosion at the north plinth is consistent with the recorded gully.',
    assessed_date: isoDaysAgo(120),
  })
  if (!environmentalError) counts.environmental = 1

  return { seeded: true, counts }
}
