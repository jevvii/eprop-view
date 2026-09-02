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
    if (geomType === 'Polygon' && Array.isArray(rawCoords[0])) {
      flatCoords = rawCoords[0]
    } else if (geomType === 'MultiPolygon' && Array.isArray(rawCoords[0]?.[0])) {
      flatCoords = rawCoords[0][0]
    } else if (geomType === 'LineString') {
      flatCoords = rawCoords
    } else if (geomType === 'MultiLineString' && Array.isArray(rawCoords[0])) {
      flatCoords = rawCoords[0]
    } else if (geomType === 'Point' && Array.isArray(rawCoords)) {
      flatCoords = [rawCoords]
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
      geom: feat.geometry,
      description,
    })
  }

  return results
}
