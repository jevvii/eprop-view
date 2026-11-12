import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import ts from 'typescript'

// The real scorer consumes geometry answers from PostGIS, never fabricated map coordinates.
const actionUrl = new URL('./environmental/scoring.ts', import.meta.url)
const actionPath = fileURLToPath(actionUrl)
const requireAction = createRequire(actionUrl)
const state = { context: {} as Record<string, unknown>, error: null as null | { message: string }, calls: [] as string[] }
const compiled = ts.transpileModule(readFileSync(actionUrl, 'utf8'), {
  fileName: actionPath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
}).outputText
const loaded = { exports: {} as { computeProjectEnvironmentalRisk: (id: string) => Promise<Record<string, unknown>> } }
compileFunction(compiled, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: actionPath })(
  loaded.exports,
  (specifier: string) => specifier === '@/app/lib/supabase/server' ? { createClient: async () => ({ rpc: async (name: string) => {
    state.calls.push(name)
    return { data: state.context, error: state.error }
  } }) } : requireAction(specifier),
  loaded, actionPath, dirname(actionPath)
)
const { computeProjectEnvironmentalRisk } = loaded.exports
const siteId = '11111111-1111-4111-8111-111111111111'
const zone = (type: string, coversSite: boolean, distanceM = 0, risk = 'zone_a') => ({
  id: siteId, name: type, zone_type: type, risk_level: risk, covers_site: coversSite,
  distance_m: distanceM, is_active: true,
})
beforeEach(() => {
  state.context = { project_id: siteId, project_name: 'Measured site', latitude: 0, longitude: 0, zones: [], observed_erosion: null }
  state.error = null
  state.calls = []
})
describe('Environmental scoring from actual PostGIS geometry', () => {
  test('a fault crossing the site is very high, irrespective of endpoint distance', async () => {
    state.context.zones = [zone('fault_line', true, 0)]
    const result = await computeProjectEnvironmentalRisk(siteId)
    assert.equal(result.fault_line_proximity, 'very_high')
    assert.deepEqual(state.calls, ['project_hazard_context'])
  })
  test('unrelated liquefaction polygons are excluded even beside a fault', async () => {
    const zones = [zone('fault_line', true, 0), zone('liquefaction', false, 100000)]
    state.context.zones = zones
    const first = await computeProjectEnvironmentalRisk(siteId)
    state.context.zones = [...zones].reverse()
    const second = await computeProjectEnvironmentalRisk(siteId)
    assert.equal(first.soil_liquefaction_risk, 'none')
    assert.deepEqual(second, first)
  })
  test('polygon holes/multipolygons use the spatial membership result, not existence of a layer', async () => {
    state.context.zones = [zone('flood', false), zone('liquefaction', true, 0, 'zone_b')]
    const result = await computeProjectEnvironmentalRisk(siteId)
    assert.equal(result.soil_liquefaction_risk, 'zone_b')
    assert.equal((result.memberships as Record<string, boolean>).flood, false)
    assert.equal((result.memberships as Record<string, boolean>).liquefaction, true)
  })
  test('inactive layers do not contribute even if a stale context includes one', async () => {
    state.context.zones = [{ ...zone('liquefaction', true), is_active: false }]
    const result = await computeProjectEnvironmentalRisk(siteId)
    assert.equal(result.soil_liquefaction_risk, 'none')
  })
  test('recorded severe erosion contributes to the project assessment', async () => {
    state.context.observed_erosion = 'severe'
    const result = await computeProjectEnvironmentalRisk(siteId)
    assert.equal(result.erosion_potential, 'severe')
    assert.match(String(result.additional_analysis), /field observation/i)
  })
  test('missing geometry is an actionable failure, never a hardcoded city coordinate', async () => {
    state.context.latitude = null
    state.context.longitude = null
    await assert.rejects(computeProjectEnvironmentalRisk(siteId), /coordinates|geometry/i)
  })
  test('database errors retain the underlying reason', async () => {
    state.error = { message: 'GIS migration unavailable' }
    await assert.rejects(computeProjectEnvironmentalRisk(siteId), /GIS migration unavailable/)
  })
})
