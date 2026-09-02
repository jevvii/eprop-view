import type { GeospatialZone, ZoneType, ZoneRiskLevel } from '@/app/types'

export interface ParsedGeoZone {
  name: string
  zone_type: ZoneType
  risk_level: ZoneRiskLevel
  coordinates: number[][]
  geom: {
    type: 'Polygon' | 'MultiPolygon' | 'Point' | 'LineString' | 'MultiLineString'
    coordinates: any
  }
  description: string
}

/**
 * Normalizes property names regardless of case or abbreviation
 * (e.g. ZONE_TYPE, type, hazard_type -> zone_type).
 */
function extractZoneType(props: Record<string, any>): ZoneType {
  const candidate = (
    props.zone_type ||
    props.type ||
    props.hazard ||
    props.HAZARD ||
    props.ZONE_TYPE ||
    ''
  ).toLowerCase()

  if (candidate.includes('fault') || candidate.includes('seismic')) return 'fault_line'
  if (candidate.includes('liquefaction') || candidate.includes('soil')) return 'liquefaction'
  if (candidate.includes('flood') || candidate.includes('inundation')) return 'flood'
  if (candidate.includes('erosion') || candidate.includes('landslide')) return 'erosion'
  return 'general'
}

function extractRiskLevel(props: Record<string, any>): ZoneRiskLevel {
  const candidate = (
    props.risk_level ||
    props.risk ||
    props.severity ||
    props.RISK ||
    props.LEVEL ||
    ''
  ).toLowerCase()

  if (candidate.includes('high') || candidate.includes('critical') || candidate.includes('a')) return 'zone_a'
  if (candidate.includes('mod') || candidate.includes('medium') || candidate.includes('b')) return 'zone_b'
  return 'zone_c'
}

/**
 * Validates that coordinates fall within WGS84 geographic boundaries [-180, 180], [-90, 90].
 */
export function validateCoordinatesBounds(coords: number[][]): boolean {
  for (const pt of coords) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    const [lon, lat] = pt
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return false
    }
  }
  return true
}

/**
 * Ensures that a polygon linear ring is properly closed (first and last coordinates match).
 */
export function ensureClosedRing(ring: number[][]): number[][] {
  if (ring.length === 0) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...ring, [first[0], first[1]]]
  }
  return ring
}

/**
 * Parses a GeoJSON string or object into validated GeospatialZone rows.
 */
export function parseGeoJSON(content: string | object): ParsedGeoZone[] {
  const data = typeof content === 'string' ? JSON.parse(content) : content

  const features: any[] = []
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    features.push(...data.features)
  } else if (data.type === 'Feature') {
    features.push(data)
  } else if (data.type === 'Polygon' || data.type === 'LineString' || data.type === 'MultiPolygon') {
    features.push({
      type: 'Feature',
      geometry: data,
      properties: {},
    })
  } else {
    throw new Error('Invalid GeoJSON: Must be FeatureCollection, Feature, or valid Geometry')
  }

  const results: ParsedGeoZone[] = []

  for (let i = 0; i < features.length; i++) {
    const feat = features[i]
    if (!feat.geometry) continue

    const geomType = feat.geometry.type
    const rawCoords = feat.geometry.coordinates
    const props = feat.properties || {}

    // Extract 2D ring coordinates representation for mapbox polygon/linestring
    let flatCoords: number[][] = []
    let sanitizedGeom = { ...feat.geometry }

    if (geomType === 'Polygon' && Array.isArray(rawCoords[0])) {
      const closedRing = ensureClosedRing(rawCoords[0])
      flatCoords = closedRing
      sanitizedGeom.coordinates = [closedRing, ...rawCoords.slice(1).map(ensureClosedRing)]
    } else if (geomType === 'MultiPolygon' && Array.isArray(rawCoords[0]?.[0])) {
      const closedRing = ensureClosedRing(rawCoords[0][0])
      flatCoords = closedRing
    } else if (geomType === 'LineString') {
      flatCoords = rawCoords
    } else if (geomType === 'MultiLineString' && Array.isArray(rawCoords[0])) {
      flatCoords = rawCoords[0]
    } else if (geomType === 'Point' && Array.isArray(rawCoords)) {
      flatCoords = [rawCoords]
    }

    if (!validateCoordinatesBounds(flatCoords)) {
      throw new Error(`Invalid coordinates in feature "${props.name || i + 1}": Coordinates exceed WGS84 range [-180..180, -90..90]`)
    }

    const name = props.name || props.NAME || props.title || `Hazard Zone ${i + 1}`
    const description = props.description || props.desc || props.NOTES || ''
    const zone_type = extractZoneType(props)
    const risk_level = extractRiskLevel(props)

    results.push({
      name,
      zone_type,
      risk_level,
      coordinates: flatCoords,
      geom: sanitizedGeom,
      description,
    })
  }

  return results
}
