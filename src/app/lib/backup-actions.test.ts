import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
type Row = Record<string, unknown>
const projectId = '11111111-1111-4111-8111-111111111111'
const inspectionId = '22222222-2222-4222-8222-222222222222'
const reportId = '33333333-3333-4333-8333-333333333333'
const state = { tables: {} as Record<string, Row[]>, fail: '', rpcPayload: null as Row | null, writes: 0 }
const client = {
  from(table: string) {
    const filters: ((r: Row) => boolean)[] = []; let start = 0, end = 499
    const execute = async () => ({ data: state.fail === table ? null : (state.tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(start, end + 1), error: state.fail === table ? new Error('query unavailable') : null })
    const q = { select: () => q, order: () => q, eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q }, in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return q }, range: (a: number, b: number) => { start = a; end = b; return q }, single: async () => { const r = await execute(); return { ...r, data: r.data?.[0] ?? null } }, maybeSingle: async () => { const r = await execute(); return { ...r, data: r.data?.[0] ?? null } }, then: (resolve: (r: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve) }
    return q
  },
  rpc: async (_name: string, payload: Row) => { state.writes++; state.rpcPayload = payload; return { data: '44444444-4444-4444-8444-444444444444', error: null } },
}
function loadAction(file: string) {
  const actionUrl = new URL(`../actions/${file}.ts`, import.meta.url), filename = fileURLToPath(actionUrl), req = createRequire(actionUrl)
  const code = ts.transpileModule(readFileSync(actionUrl, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText
  const mod = { exports: {} }
  compileFunction(code, ['exports', 'require', 'module', '__filename', '__dirname'], { filename })(mod.exports, (name: string) => {
    if (name === '@/app/lib/supabase/server') return { createClient: async () => client }
    if (name === '@/app/lib/dal') return { requireRole: async () => ({ userId: projectId }), requireCapabilityCheck: async () => ({ userId: projectId }) }
    if (name === '@/app/lib/audit') return { recordAuditEvent: async () => {} }
    if (name.startsWith('@/')) return req(fileURLToPath(new URL(`../../${name.slice(2)}.ts`, import.meta.url)))
    return req(name)
  }, mod, filename, dirname(filename))
  return mod.exports
}
const actions = loadAction('backup') as {
  exportProjectRecords(id: string): Promise<Record<string, unknown>>
  importProjectRecords(payload: unknown, options?: { dryRun: boolean }): Promise<{ imported: boolean; warnings: string[] }>
}
const csvActions = loadAction('export') as {
  exportReportsCsv(id?: string): Promise<{ csv: string; rowCount: number }>
}
beforeEach(() => {
  state.tables = {
    projects: [{ id: projectId, name: 'Test Site', status: 'active', location: null, description: null }],
    inspections: [{ id: inspectionId, project_id: projectId, inspection_date: '2026-11-12', status: 'pending', risk_score: 4, risk_level: 'moderate', location: '', notes: null }],
    reports: [{ id: reportId, project_id: projectId, inspection_id: inspectionId, report_id: 'RPT-1', title: 'Report', date: '2026-11-12', location: '', status: 'open', risk_score: 4, key_findings: null }],
    maintenance_priorities: [], environmental_risks: [{ id: '55555555-5555-4555-8555-555555555555', project_id: projectId, overall_risk_score: 4 }], risk_hotspots: [],
  }
  state.fail = ''; state.writes = 0; state.rpcPayload = null
})
describe('Actual project export/import actions', () => {
  test('export rejects failed child queries rather than inventing empty collections', async () => {
    state.fail = 'reports'
    await assert.rejects(actions.exportProjectRecords(projectId), /unavailable/)
  })
  test('export collects every inspection, not the first database page', async () => {
    state.tables.inspections = Array.from({ length: 1001 }, (_, i) => ({ ...state.tables.inspections[0], id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }))
    const result = await actions.exportProjectRecords(projectId)
    assert.equal((result.counts as { inspections: number }).inspections, 1001)
  })
  test('a valid exported nullable report can be previewed without any write', async () => {
    const exported = await actions.exportProjectRecords(projectId)
    const preview = await actions.importProjectRecords(exported, { dryRun: true })
    assert.equal(preview.imported, false)
    assert.equal(state.writes, 0)
    assert(preview.warnings.some(w => /signature|approval/i.test(w)))
  })
  test('apply sends all included records including environmental risks to one atomic import', async () => {
    const exported = await actions.exportProjectRecords(projectId)
    const result = await actions.importProjectRecords(exported, { dryRun: false })
    assert.equal(result.imported, true)
    assert.equal(state.writes, 1)
    const normalized = state.rpcPayload?.p_export as { records: { environmental_risks: Row[]; reports: Row[] } }
    assert.equal(normalized.records.environmental_risks.length, 1)
    assert.equal(normalized.records.reports[0].key_findings, null)
  })
})

describe('Actual CSV export action', () => {
  test('CSV includes only signed recommendation text and neutralizes submitted formulas', async () => {
    Object.assign(state.tables.reports[0], { title: '=HYPERLINK("url")', content_updated_at: '2026-11-12T10:00:00Z',
      recommendations: [{ status: 'draft', final_text: 'PRIVATE DRAFT', provenance: 'gemini' }, { status: 'signed', final_text: 'REVIEWED FINAL', provenance: 'engineer', signed_at: '2026-11-12T11:00:00Z' }],
      report_limitations: { standard_exclusions: ['Visual inspection only'], free_text: null },
      cost_estimates: [],
    })
    const result = await csvActions.exportReportsCsv(projectId)
    assert.match(result.csv, /'=HYPERLINK/)
    assert.match(result.csv, /REVIEWED FINAL/)
    assert.match(result.csv, /Visual inspection only/)
    assert.doesNotMatch(result.csv, /PRIVATE DRAFT/)
  })
  test('CSV exports every report beyond the API cap', async () => {
    state.tables.reports = Array.from({ length: 1001 }, (_, index) => ({ ...state.tables.reports[0], id: String(index) }))
    assert.equal((await csvActions.exportReportsCsv()).rowCount, 1001)
  })
})
