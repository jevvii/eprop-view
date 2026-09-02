import zlib from 'node:zlib'
import { parseGeoJSON, type ParsedGeoZone } from './import-geojson'

/**
 * Reprojects Web Mercator (EPSG:3857) coordinates to WGS84 (EPSG:4326) degrees.
 */
function reprojectMercatorToWGS84(x: number, y: number): [number, number] {
  const lon = (x / 20037508.342789244) * 180
  let lat = (y / 20037508.342789244) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return [
    Math.max(-180, Math.min(180, Number(lon.toFixed(6)))),
    Math.max(-90, Math.min(90, Number(lat.toFixed(6)))),
  ]
}

/**
 * Checks if coordinates appear to be projected meters instead of WGS84 degrees.
 */
function needsReprojection(x: number, y: number, prjContent?: string): boolean {
  if (prjContent && (prjContent.includes('Mercator') || prjContent.includes('3857') || prjContent.includes('UTM'))) {
    return true
  }
  return Math.abs(x) > 180 || Math.abs(y) > 90
}

/**
 * Unzips a ZIP archive buffer and extracts all entries into a filename -> Buffer map.
 */
export function unzipArchive(buffer: ArrayBuffer): Map<string, Buffer> {
  const bytes = Buffer.from(buffer)
  const files = new Map<string, Buffer>()
  let offset = 0

  while (offset < bytes.length - 4) {
    const sig = bytes.readUInt32LE(offset)
    if (sig !== 0x04034b50) {
      // Not a local file header (reached central directory or end)
      break
    }

    const compMethod = bytes.readUInt16LE(offset + 8)
    const compSize = bytes.readUInt32LE(offset + 18)
    const uncompSize = bytes.readUInt32LE(offset + 22)
    const nameLen = bytes.readUInt16LE(offset + 26)
    const extraLen = bytes.readUInt16LE(offset + 28)

    const nameStart = offset + 30
    const nameEnd = nameStart + nameLen
    const filename = bytes.toString('utf8', nameStart, nameEnd)

    const dataStart = nameEnd + extraLen
    const dataEnd = dataStart + compSize

    if (dataEnd > bytes.length) break

    const rawData = bytes.subarray(dataStart, dataEnd)
    let extracted: Buffer

    if (compMethod === 0) {
      extracted = Buffer.from(rawData)
    } else if (compMethod === 8) {
      extracted = zlib.inflateRawSync(rawData)
    } else {
      // Unsupported compression method, skip
      offset = dataEnd
      continue
    }

    // Normalize basename
    const base = filename.split('/').pop() || filename
    if (base && !base.startsWith('.')) {
      files.set(base.toLowerCase(), extracted)
    }

    offset = dataEnd
  }

  return files
}

/**
 * Parses dBase III (.dbf) attribute records from buffer.
 */
export function parseDBF(dbfBuffer: Buffer): Record<string, any>[] {
  if (dbfBuffer.length < 32) return []

  const numRecords = dbfBuffer.readUInt32LE(4)
  const headerLen = dbfBuffer.readUInt16LE(8)
  const recordLen = dbfBuffer.readUInt16LE(10)

  const fields: { name: string; type: string; len: number; offset: number }[] = []
  let fieldOffset = 0
  let pos = 32

  while (pos < headerLen && dbfBuffer[pos] !== 0x0d) {
    const rawName = dbfBuffer.toString('ascii', pos, pos + 11).replace(/\0.*$/, '').trim()
    const type = String.fromCharCode(dbfBuffer[pos + 11])
    const len = dbfBuffer[pos + 16]

    fields.push({ name: rawName, type, len, offset: fieldOffset })
    fieldOffset += len
    pos += 32
  }

  const records: Record<string, any>[] = []
  let recPos = headerLen

  for (let r = 0; r < numRecords && recPos + recordLen <= dbfBuffer.length; r++) {
    const isDeleted = dbfBuffer[recPos] === 0x2a // '*'
    if (!isDeleted) {
      const row: Record<string, any> = {}
      for (const field of fields) {
        const valStart = recPos + 1 + field.offset
        const valEnd = valStart + field.len
        const rawVal = dbfBuffer.toString('utf8', valStart, valEnd).trim()
        row[field.name] = rawVal
      }
      records.push(row)
    }
    recPos += recordLen
  }

  return records
}

/**
 * Parses ESRI Shapefile binary geometry buffer (.shp).
 */
export function parseSHP(
  shpBuffer: Buffer,
  dbfRecords: Record<string, any>[] = [],
  prjContent?: string
): ParsedGeoZone[] {
  if (shpBuffer.length < 100) return []

  const view = new DataView(shpBuffer.buffer, shpBuffer.byteOffset, shpBuffer.byteLength)
  const fileCode = view.getInt32(0, false)
  if (fileCode !== 9994) {
    throw new Error('Invalid ESRI Shapefile: Header signature does not match 9994')
  }

  const zones: ParsedGeoZone[] = []
  let offset = 100
  let recordIndex = 0

  while (offset + 8 <= shpBuffer.length) {
    const contentLengthWords = view.getInt32(offset + 4, false)
    const recordLengthBytes = contentLengthWords * 2
    const contentOffset = offset + 8

    if (contentOffset + recordLengthBytes > shpBuffer.length) break

    const shapeType = view.getInt32(contentOffset, true)
    const attrs = dbfRecords[recordIndex] || {}
    recordIndex++

    // 3: PolyLine (LineString), 5: Polygon
    if (shapeType === 3 || shapeType === 5) {
      const numParts = view.getInt32(contentOffset + 32, true)
      const numPoints = view.getInt32(contentOffset + 36, true)

      const partsOffsets: number[] = []
      let pPos = contentOffset + 40
      for (let p = 0; p < numParts; p++) {
        partsOffsets.push(view.getInt32(pPos, true))
        pPos += 4
      }

      const points: [number, number][] = []
      let ptPos = pPos
      for (let i = 0; i < numPoints; i++) {
        let x = view.getFloat64(ptPos, true)
        let y = view.getFloat64(ptPos + 8, true)
        if (needsReprojection(x, y, prjContent)) {
          const [rx, ry] = reprojectMercatorToWGS84(x, y)
          x = rx
          y = ry
        }
        points.push([x, y])
        ptPos += 16
      }

      // Group points into rings/parts
      const parts: [number, number][][] = []
      for (let p = 0; p < numParts; p++) {
        const start = partsOffsets[p]
        const end = p < numParts - 1 ? partsOffsets[p + 1] : numPoints
        parts.push(points.slice(start, end))
      }

      const isLine = shapeType === 3
      const name = attrs.NAME || attrs.name || attrs.TITLE || attrs.title || attrs.ZONE || `Hazard Layer ${recordIndex}`
      const desc = attrs.DESC || attrs.desc || attrs.DESCRIPTION || attrs.description || ''
      const zoneTypeCandidate = (attrs.TYPE || attrs.type || attrs.HAZARD || attrs.hazard || (isLine ? 'fault_line' : 'liquefaction')).toLowerCase()
      const riskCandidate = (attrs.RISK || attrs.risk || attrs.SEVERITY || 'zone_b').toLowerCase()

      const zone_type = zoneTypeCandidate.includes('fault')
        ? 'fault_line'
        : zoneTypeCandidate.includes('flood')
        ? 'flood'
        : zoneTypeCandidate.includes('erosion')
        ? 'erosion'
        : 'liquefaction'

      const risk_level = riskCandidate.includes('a') || riskCandidate.includes('high')
        ? 'zone_a'
        : riskCandidate.includes('b') || riskCandidate.includes('med')
        ? 'zone_b'
        : 'zone_c'

      const primaryCoords = parts[0] || []

      zones.push({
        name,
        zone_type,
        risk_level,
        coordinates: primaryCoords,
        geom: isLine
          ? {
              type: numParts > 1 ? 'MultiLineString' : 'LineString',
              coordinates: numParts > 1 ? parts : primaryCoords,
            }
          : {
              type: numParts > 1 ? 'MultiPolygon' : 'Polygon',
              coordinates: numParts > 1 ? [parts] : parts,
            },
        description: desc,
      })
    }

    offset += 8 + recordLengthBytes
  }

  return zones
}

/**
 * Shapefile importer accepting GeoJSON text, raw binary .shp, or zipped archives (.zip).
 */
export async function parseShapefile(
  bufferOrText: ArrayBuffer | string,
  filename?: string
): Promise<ParsedGeoZone[]> {
  if (typeof bufferOrText === 'string') {
    return parseGeoJSON(bufferOrText)
  }

  // Attempt JSON/GeoJSON text decoding first
  const decoder = new TextDecoder('utf-8')
  const text = decoder.decode(bufferOrText)
  if (text.trim().startsWith('{')) {
    return parseGeoJSON(text)
  }

  // Check if buffer is a ZIP archive
  const bytes = Buffer.from(bufferOrText)
  if (bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50) {
    const unzipped = unzipArchive(bufferOrText)

    // Locate .shp, .dbf, and .prj
    let shpBuf: Buffer | undefined
    let dbfBuf: Buffer | undefined
    let prjText: string | undefined

    for (const [name, buf] of unzipped.entries()) {
      if (name.endsWith('.shp')) shpBuf = buf
      else if (name.endsWith('.dbf')) dbfBuf = buf
      else if (name.endsWith('.prj')) prjText = buf.toString('utf8')
    }

    if (!shpBuf) {
      throw new Error('ZIP archive does not contain a .shp geometry file')
    }

    const dbfRecords = dbfBuf ? parseDBF(dbfBuf) : []
    return parseSHP(shpBuf, dbfRecords, prjText)
  }

  // Direct raw .shp binary file upload
  return parseSHP(bytes, [], undefined)
}
