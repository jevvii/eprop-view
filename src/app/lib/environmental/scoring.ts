import { z } from 'zod'
import { createClient } from '@/app/lib/supabase/server'

const zoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  zone_type: z.string(),
  risk_level: z.enum(['zone_a', 'zone_b', 'zone_c']),
  covers_site: z.boolean(),
  distance_m: z.number().finite().nonnegative().nullable(),
  is_active: z.boolean().default(true),
})
const contextSchema = z.object({
  project_id: z.string(),
  project_name: z.string(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  zones: z.array(zoneSchema),
  observed_erosion: z.enum(['none', 'minor', 'moderate', 'severe']).nullable(),
})

export interface RiskComputationResult {
  overall_risk_score: number
  fault_line_proximity: 'none' | 'low' | 'moderate' | 'high' | 'very_high'
  soil_liquefaction_risk: 'zone_a' | 'zone_b' | 'zone_c' | 'none'
  erosion_potential: 'severe' | 'moderate' | 'low' | 'negligible'
  overlappingZones: z.infer<typeof zoneSchema>[]
  /** Actual geometry memberships; a missing layer is not evidence of absence. */
  memberships: Record<string, boolean>
  coverage: string[]
  nearestFaultDistanceKm: number | null
  additional_analysis: string
}

/**
 * Project-defined decision-support formula, not an engineering safety standard.
 * Geometry answers come from PostGIS: ST_Distance(geography) measures distance to
 * the entire trace; ST_Covers handles boundaries, polygon holes and multipolygons.
 * https://postgis.net/docs/ST_Distance.html · https://postgis.net/docs/ST_Covers.html
 */
export async function computeProjectEnvironmentalRisk(projectId: string): Promise<RiskComputationResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('project_hazard_context', { p_project_id: projectId })
  if (error) throw new Error(`Could not assess mapped hazards: ${error.message}`)
  const parsed = contextSchema.safeParse(data)
  if (!parsed.success) {
    throw new Error('Project geometry/coordinates or hazard context are unavailable. Record the real site coordinates and verify the GIS migration before assessing hazards.')
  }
  const context = parsed.data
  const zones = context.zones.filter((zone) => zone.is_active)
  const coverage = [...new Set(zones.map((zone) => zone.zone_type))].sort()
  const memberships: Record<string, boolean> = {}
  for (const type of coverage) memberships[type] = zones.some((zone) => zone.zone_type === type && zone.covers_site)
  const overlappingZones = zones.filter((zone) => zone.covers_site).sort((a, b) => a.id.localeCompare(b.id) || a.zone_type.localeCompare(b.zone_type))
  const faultDistances = zones.filter((zone) => zone.zone_type === 'fault_line' && zone.distance_m != null).map((zone) => zone.distance_m as number)
  const faultDistance = faultDistances.length ? Math.min(...faultDistances) / 1000 : null
  const fault: RiskComputationResult['fault_line_proximity'] = faultDistance == null ? 'none'
    : faultDistance < 1 ? 'very_high' : faultDistance < 5 ? 'high'
      : faultDistance < 15 ? 'moderate' : faultDistance < 30 ? 'low' : 'none'
  const ranks = ['none', 'zone_c', 'zone_b', 'zone_a'] as const
  let liquefaction: RiskComputationResult['soil_liquefaction_risk'] = 'none'
  let erosion: RiskComputationResult['erosion_potential'] = 'negligible'
  const erosionRanks = ['negligible', 'low', 'moderate', 'severe'] as const
  for (const zone of overlappingZones) {
    if (zone.zone_type === 'liquefaction' && ranks.indexOf(zone.risk_level) > ranks.indexOf(liquefaction)) liquefaction = zone.risk_level
    if (zone.zone_type === 'erosion') {
      const candidate = zone.risk_level === 'zone_a' ? 'severe' : zone.risk_level === 'zone_b' ? 'moderate' : 'low'
      if (erosionRanks.indexOf(candidate) > erosionRanks.indexOf(erosion)) erosion = candidate
    }
  }
  const observedErosion = context.observed_erosion === 'severe' ? 'severe' : context.observed_erosion === 'moderate' ? 'moderate' : context.observed_erosion === 'minor' ? 'low' : 'negligible'
  if (erosionRanks.indexOf(observedErosion) > erosionRanks.indexOf(erosion)) erosion = observedErosion
  const score = ({ none: 1, low: 2.5, moderate: 5, high: 7.5, very_high: 9.5 }[fault] * 0.4)
    + ({ none: 1, zone_c: 3.5, zone_b: 6, zone_a: 9 }[liquefaction] * 0.3)
    + ({ negligible: 1, low: 3, moderate: 6, severe: 9 }[erosion] * 0.15)
    + ((memberships.flood ? 8.5 : 1.5) * 0.15)
  const coverageNotice = coverage.length === 0 ? ' No active mapped hazard layers cover this assessment area; this is missing coverage, not proof of safety.' : ` Active dataset types: ${coverage.join(', ')}. Unmapped hazard types remain unverified.`
  const summary = `Project-defined GIS screening for ${context.project_name}: ${overlappingZones.length} site intersections. Fault proximity ${fault}${faultDistance == null ? ' (no active fault trace available)' : ` (${faultDistance.toFixed(2)} km from the complete trace)`}. Liquefaction ${liquefaction}; erosion ${erosion}.${context.observed_erosion ? ` Latest field observation: ${context.observed_erosion} erosion.` : ''}${coverageNotice}`
  return {
    overall_risk_score: Number(Math.min(10, Math.max(0, score)).toFixed(1)),
    fault_line_proximity: fault,
    soil_liquefaction_risk: liquefaction,
    erosion_potential: erosion,
    overlappingZones,
    memberships,
    coverage,
    nearestFaultDistanceKm: faultDistance,
    additional_analysis: summary,
  }
}
