/**
 * Well-Known Text (WKT) conversion utilities for PostGIS geometry columns.
 */

export interface GeoJSONGeometry {
  type: string
  coordinates: any
}

function formatCoords(coords: number[]): string {
  return `${coords[0]} ${coords[1]}`
}

function formatRing(ring: number[][]): string {
  return `(${ring.map(formatCoords).join(', ')})`
}

/**
 * Converts a GeoJSON geometry object into standard WKT format.
 */
export function geojsonToWKT(geom: GeoJSONGeometry, srid = 4326): string {
  let wktBody = ''

  switch (geom.type) {
    case 'Point':
      wktBody = `POINT(${formatCoords(geom.coordinates)})`
      break

    case 'LineString':
      wktBody = `LINESTRING(${geom.coordinates.map(formatCoords).join(', ')})`
      break

    case 'MultiLineString':
      wktBody = `MULTILINESTRING(${geom.coordinates.map(formatRing).join(', ')})`
      break

    case 'Polygon':
      // Polygon coords is array of linear rings (outer + holes)
      wktBody = `POLYGON(${geom.coordinates.map((ring: number[][]) => formatRing(ring)).join(', ')})`
      break

    case 'MultiPolygon':
      wktBody = `MULTIPOLYGON(${geom.coordinates
        .map((poly: number[][][]) => `(${poly.map((ring) => formatRing(ring)).join(', ')})`)
        .join(', ')})`
      break

    default:
      throw new Error(`Unsupported GeoJSON geometry type: ${geom.type}`)
  }

  return srid ? `SRID=${srid};${wktBody}` : wktBody
}
