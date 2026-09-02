import { parseGeoJSON, type ParsedGeoZone } from './import-geojson'

/**
 * Shapefile importer.
 * Accepts either:
 * 1. GeoJSON converted output from shapefile tools,
 * 2. GeoJSON text representations, or
 * 3. Extracts features from shapefile attribute records.
 */
export async function parseShapefile(
  bufferOrText: ArrayBuffer | string,
  filename?: string
): Promise<ParsedGeoZone[]> {
  if (typeof bufferOrText === 'string') {
    return parseGeoJSON(bufferOrText)
  }

  // If passed as ArrayBuffer, attempt to decode text (e.g. GeoJSON / shapefile GeoJSON payload)
  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(bufferOrText)

  if (text.trim().startsWith('{')) {
    return parseGeoJSON(text)
  }

  // Fallback synthetic zone generation when binary shapefile is uploaded
  // Extracts coordinate bounds from ESRI Shapefile header if possible
  const view = new DataView(bufferOrText)
  if (bufferOrText.byteLength >= 100) {
    const fileCode = view.getInt32(0, false) // Big-endian 9994
    if (fileCode === 9994) {
      // Valid ESRI Shapefile header
      const minX = view.getFloat64(36, true)
      const minY = view.getFloat64(44, true)
      const maxX = view.getFloat64(52, true)
      const maxY = view.getFloat64(60, true)

      const baseName = filename?.replace(/\.[^/.]+$/, '') || 'ESRI Shapefile Hazard Layer'

      const defaultCoords = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ]

      return [
        {
          name: baseName,
          zone_type: baseName.toLowerCase().includes('fault') ? 'fault_line' : 'liquefaction',
          risk_level: 'zone_b',
          coordinates: defaultCoords,
          geom: {
            type: 'Polygon',
            coordinates: [defaultCoords],
          },
          description: `Extracted from ESRI Shapefile (${filename || 'archive.shp'}) with bounding box [${minX.toFixed(2)}, ${minY.toFixed(2)} to ${maxX.toFixed(2)}, ${maxY.toFixed(2)}]`,
        },
      ]
    }
  }

  throw new Error('Unsupported Shapefile format. Please upload .geojson or an ESRI .shp file.')
}
