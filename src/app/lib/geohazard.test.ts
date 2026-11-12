import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseGeoJSON } from './geo/import-geojson'
import { parseShapefile } from './geo/import-shapefile'

describe('Phase D: Geohazard Layer Management Tests', () => {
  describe('GeoJSON Parser & Geometry Normalization', () => {
    test('parseGeoJSON extracts Polygon hazard zones with normalized properties', () => {
      const geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [121.04, 14.65],
                  [121.05, 14.65],
                  [121.05, 14.66],
                  [121.04, 14.66],
                  [121.04, 14.65],
                ],
              ],
            },
            properties: {
              name: 'West Valley Fault Buffer',
              hazard: 'fault_line',
              risk: 'zone_a',
              description: 'Active trace 500m buffer zone',
            },
          },
        ],
      }

      const zones = parseGeoJSON(geojson)
      assert.equal(zones.length, 1)
      assert.equal(zones[0].name, 'West Valley Fault Buffer')
      assert.equal(zones[0].zone_type, 'fault_line')
      assert.equal(zones[0].risk_level, 'zone_a')
      assert.equal(zones[0].coordinates.length, 5)
      assert.equal(zones[0].geom.type, 'Polygon')
    })

    test('parseGeoJSON extracts LineString fault lines properly', () => {
      const lineGeoJSON = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: [
                [121.041, 14.651],
                [121.045, 14.659],
                [121.049, 14.668],
              ],
            },
            properties: {
              name: 'Marikina Fault Trace',
              type: 'fault',
              severity: 'critical',
            },
          },
        ],
      }

      const zones = parseGeoJSON(lineGeoJSON)
      assert.equal(zones.length, 1)
      assert.equal(zones[0].name, 'Marikina Fault Trace')
      assert.equal(zones[0].zone_type, 'fault_line')
      assert.equal(zones[0].risk_level, 'zone_a')
      assert.equal(zones[0].geom.type, 'LineString')
      assert.equal(zones[0].coordinates.length, 3)
    })

    test('parseGeoJSON throws informative error on invalid GeoJSON', () => {
      assert.throws(() => parseGeoJSON('{ "invalid": true }'), {
        message: /Invalid GeoJSON/,
      })
    })
  })

  describe('Shapefile Parser & ESRI Compatibility', () => {
    test('parseShapefile decodes text-based GeoJSON payloads', async () => {
      const geojsonString = JSON.stringify({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [121.0, 14.6],
              [121.1, 14.6],
              [121.1, 14.7],
              [121.0, 14.7],
              [121.0, 14.6],
            ],
          ],
        },
        properties: {
          name: 'Liquefaction Zone B',
          type: 'liquefaction',
          risk: 'medium',
        },
      })

      const zones = await parseShapefile(geojsonString, 'hazard_zones.geojson')
      assert.equal(zones.length, 1)
      assert.equal(zones[0].name, 'Liquefaction Zone B')
      assert.equal(zones[0].zone_type, 'liquefaction')
      assert.equal(zones[0].risk_level, 'zone_b')
    })

    test('geojsonToWKT correctly formats PostGIS WKT geometry strings', async () => {
      const { geojsonToWKT } = await import('./geo/wkt')

      const polyWKT = geojsonToWKT(
        {
          type: 'Polygon',
          coordinates: [
            [
              [121.0, 14.5],
              [121.1, 14.5],
              [121.1, 14.6],
              [121.0, 14.6],
              [121.0, 14.5],
            ],
          ],
        },
        4326
      )
      assert.ok(polyWKT.startsWith('SRID=4326;POLYGON((121 14.5, 121.1 14.5'))

      const lineWKT = geojsonToWKT(
        {
          type: 'LineString',
          coordinates: [
            [121.0, 14.5],
            [121.2, 14.7],
          ],
        },
        4326
      )
      assert.equal(lineWKT, 'SRID=4326;LINESTRING(121 14.5, 121.2 14.7)')
    })
  })
})

function lineShapefile(points: [number, number][]): Buffer {
  const bodySize = 4 + 32 + 8 + 4 + points.length * 16
  const bytes = Buffer.alloc(100 + 8 + bodySize)
  bytes.writeInt32BE(9994, 0)
  bytes.writeInt32BE(bodySize / 2, 104)
  bytes.writeInt32LE(3, 108)
  bytes.writeInt32LE(1, 108 + 36)
  bytes.writeInt32LE(points.length, 108 + 40)
  points.forEach(([x, y], index) => {
    bytes.writeDoubleLE(x, 108 + 48 + index * 16)
    bytes.writeDoubleLE(y, 108 + 56 + index * 16)
  })
  return bytes
}

describe('Geospatial CRS and all-ring validation regressions', () => {
  test('rejects UTM instead of silently interpreting metres as Web Mercator', async () => {
    const { parseSHP } = await import('./geo/import-shapefile')
    assert.throws(() => parseSHP(lineShapefile([[500000, 1620000], [500010, 1620010]]), [], 'PROJCS["WGS_1984_UTM_Zone_51N",PROJECTION["Transverse_Mercator"]]'), /UTM|unsupported.*projection/i)
  })
  test('requires a declared CRS for projected coordinates', async () => {
    const { parseSHP } = await import('./geo/import-shapefile')
    assert.throws(() => parseSHP(lineShapefile([[500000, 1620000], [500010, 1620010]])), /CRS|projection/i)
  })
  test('accepts explicitly declared Web Mercator and converts to WGS84', async () => {
    const { parseSHP } = await import('./geo/import-shapefile')
    const zones = parseSHP(lineShapefile([[0, 0], [111319.490793, 111325.142866]]), [], 'PROJCS["WGS 84 / Pseudo-Mercator",AUTHORITY["EPSG","3857"]]')
    assert.equal(zones[0].coordinates[0][0], 0)
    assert.ok(Math.abs(zones[0].coordinates[1][0] - 1) < 0.00001)
    assert.ok(Math.abs(zones[0].coordinates[1][1] - 1) < 0.00001)
  })
  test('rejects non-finite coordinates in every polygon, not only the first shell', () => {
    assert.throws(() => parseGeoJSON({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      [[[0, 0], [Number.NaN, 0], [1, 1], [0, 0]]],
    ] } }), /coordinates/i)
  })
})

test('ESRI polygon parts preserve disjoint shells and interior holes', async () => {
  const { parseSHP } = await import('./geo/import-shapefile')
  const rings: [number, number][][] = [
    [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
    [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]],
    [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]],
  ]
  const points = rings.flat(), bodySize = 44 + rings.length * 4 + points.length * 16
  const bytes = Buffer.alloc(108 + bodySize)
  bytes.writeInt32BE(9994, 0)
  bytes.writeInt32BE(bodySize / 2, 104)
  bytes.writeInt32LE(5, 108)
  bytes.writeInt32LE(rings.length, 144)
  bytes.writeInt32LE(points.length, 148)
  let offset = 0
  rings.forEach((ring, index) => { bytes.writeInt32LE(offset, 152 + index * 4); offset += ring.length })
  points.forEach(([x, y], index) => {
    bytes.writeDoubleLE(x, 152 + rings.length * 4 + index * 16)
    bytes.writeDoubleLE(y, 160 + rings.length * 4 + index * 16)
  })
  const [zone] = parseSHP(bytes)
  assert.equal(zone.geom.type, 'MultiPolygon')
  assert.deepEqual(zone.geom.coordinates, [[rings[0], rings[1]], [rings[2]]])
})

test('hazard risk labels do not become high risk merely because they contain the letter a', () => {
  for (const [risk, expected] of [['moderate', 'zone_b'], ['medium', 'zone_b'], ['low hazard', 'zone_c'], ['zone_a', 'zone_a'], ['high', 'zone_a']]) {
    const [zone] = parseGeoJSON({ type: 'Feature', geometry: { type: 'Point', coordinates: [121, 14] }, properties: { risk } })
    assert.equal(zone.risk_level, expected, risk)
  }
})
