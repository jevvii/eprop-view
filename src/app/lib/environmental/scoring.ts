import { createClient } from '@/app/lib/supabase/server'
import type { GeospatialZone } from '@/app/types'

export interface RiskComputationResult {
  overall_risk_score: number
  fault_line_proximity: 'none' | 'low' | 'moderate' | 'high' | 'very_high'
  soil_liquefaction_risk: 'zone_a' | 'zone_b' | 'zone_c' | 'none'
  erosion_potential: 'severe' | 'moderate' | 'low' | 'negligible'
  overlappingZones: GeospatialZone[]
  additional_analysis: string
}

/**
 * Calculates Euclidean distance between two geographic coordinates in kilometers (Haversine formula).
 */
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Point in polygon test using ray casting algorithm.
 */
function isPointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [lng, lat] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Analyzes active geospatial zones against project coordinates to compute an automated
 * civil environmental risk assessment score (0 to 10 scale).
 */
export async function computeProjectEnvironmentalRisk(projectId: string): Promise<RiskComputationResult> {
  const supabase = await createClient()

  // Fetch project location
  const { data: project, error: projError } = await supabase
    .from('projects')
    .select('id, name, location, latitude, longitude, geom')
    .eq('id', projectId)
    .single()

  if (projError || !project) {
    throw new Error(`Project ${projectId} not found`)
  }

  const projLat = project.latitude ?? project.geom?.coordinates?.[1] ?? 14.6507
  const projLon = project.longitude ?? project.geom?.coordinates?.[0] ?? 121.0484

  // Fetch all active geospatial zones
  const { data: rawZones, error: zonesError } = await supabase
    .from('geospatial_zones')
    .select('*')
    .or(`project_id.eq.${projectId},project_id.is.null`)

  if (zonesError) throw zonesError
  const zones = (rawZones || []) as GeospatialZone[]

  let minFaultDistKm = Infinity
  let highestLiquefactionZone: 'zone_a' | 'zone_b' | 'zone_c' | 'none' = 'none'
  let highestErosion: 'severe' | 'moderate' | 'low' | 'negligible' = 'negligible'
  let floodOverlap = false
  const overlappingZones: GeospatialZone[] = []

  for (const zone of zones) {
    if (!zone.coordinates || zone.coordinates.length === 0) continue

    const isInside = isPointInPolygon([projLon, projLat], zone.coordinates)
    if (isInside) {
      overlappingZones.push(zone)
    }

    // Measure distance to closest point in zone geometry
    for (const pt of zone.coordinates) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const dist = calculateDistanceKm(projLat, projLon, pt[1], pt[0])
        if (zone.zone_type === 'fault_line' && dist < minFaultDistKm) {
          minFaultDistKm = dist
        }
      }
    }

    if (zone.zone_type === 'liquefaction' && (isInside || minFaultDistKm < 2)) {
      if (zone.risk_level === 'zone_a') highestLiquefactionZone = 'zone_a'
      else if (zone.risk_level === 'zone_b' && highestLiquefactionZone !== 'zone_a') highestLiquefactionZone = 'zone_b'
      else if (highestLiquefactionZone === 'none') highestLiquefactionZone = 'zone_c'
    }

    if (zone.zone_type === 'erosion' && isInside) {
      if (zone.risk_level === 'zone_a') highestErosion = 'severe'
      else if (zone.risk_level === 'zone_b' && highestErosion !== 'severe') highestErosion = 'moderate'
      else if (highestErosion === 'negligible') highestErosion = 'low'
    }

    if (zone.zone_type === 'flood' && isInside) {
      floodOverlap = true
    }
  }

  // Derive fault line proximity classification
  let faultLineProximity: 'none' | 'low' | 'moderate' | 'high' | 'very_high' = 'none'
  if (minFaultDistKm < 1.0) faultLineProximity = 'very_high'
  else if (minFaultDistKm < 5.0) faultLineProximity = 'high'
  else if (minFaultDistKm < 15.0) faultLineProximity = 'moderate'
  else if (minFaultDistKm < 30.0) faultLineProximity = 'low'

  // Weighted scoring computation (0 to 10)
  // Fault proximity weight: 40%
  const faultScoreMap = { very_high: 9.5, high: 7.5, moderate: 5.0, low: 2.5, none: 1.0 }
  const faultScore = faultScoreMap[faultLineProximity] * 0.40

  // Liquefaction weight: 30%
  const liqScoreMap = { zone_a: 9.0, zone_b: 6.0, zone_c: 3.5, none: 1.0 }
  const liqScore = liqScoreMap[highestLiquefactionZone] * 0.30

  // Erosion weight: 15%
  const erosionScoreMap = { severe: 9.0, moderate: 6.0, low: 3.0, negligible: 1.0 }
  const erosionScore = erosionScoreMap[highestErosion] * 0.15

  // Flood impact weight: 15%
  const floodScore = (floodOverlap ? 8.5 : 1.5) * 0.15

  const totalCalculated = Math.min(10, Math.max(0.5, Number((faultScore + liqScore + erosionScore + floodScore).toFixed(1))))

  const summary = `Automated GIS layer synthesis for ${project.name}: Detected ${overlappingZones.length} hazard zone intersections. Fault proximity: ${faultLineProximity.toUpperCase()} (${minFaultDistKm < 100 ? `${minFaultDistKm.toFixed(1)} km to active trace` : 'outside primary fault buffer'}). Liquefaction category: ${highestLiquefactionZone.toUpperCase()}. Erosion potential: ${highestErosion.toUpperCase()}.${floodOverlap ? ' Site intersects mapped flood inundation zone.' : ''}`

  return {
    overall_risk_score: totalCalculated,
    fault_line_proximity: faultLineProximity,
    soil_liquefaction_risk: highestLiquefactionZone,
    erosion_potential: highestErosion,
    overlappingZones,
    additional_analysis: summary,
  }
}
