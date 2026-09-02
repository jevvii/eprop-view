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
