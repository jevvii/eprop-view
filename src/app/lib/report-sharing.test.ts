import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

const tables: string[] = []
const original = { report_id: 'RPT-1', title: 'Signed snapshot title', date: '2026-11-11', location: 'Column A', status: 'completed', risk_score: 7.2, key_findings: 'Snapshot finding' }
let share: Record<string, unknown> | null = null
const url = new URL('../share/[token]/page.tsx', import.meta.url)
const nativeRequire = createRequire(url)
const loaded = { exports: {} as { default: (input: { params: Promise<{ token: string }> }) => Promise<ReactElement> } }
const source = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
compileFunction(source, ['exports', 'require', 'module'], { filename: url.pathname })(loaded.exports, (specifier: string) => {
  if (specifier === '@/app/lib/supabase/service') return { createServiceClient: () => ({ from: (table: string) => {
    tables.push(table)
    const query = { select: () => query, eq: () => query, order: async () => ({ data: [], error: null }), maybeSingle: async () => ({ data: table === 'share_tokens' ? share : { ...original, title: 'Later live edit must not leak' }, error: null }) }
    return query
  } }) }
  return nativeRequire(specifier)
}, loaded)
const render = async () => renderToStaticMarkup(await loaded.exports.default({ params: Promise.resolve({ token: 'A'.repeat(32) }) }))
beforeEach(() => { tables.length = 0; share = { report_id: 'report-id', expires_at: '2099-01-01T00:00:00Z', revoked_at: null, snapshot: { report: original, limitation: { standard_exclusions: ['No intrusive testing'], free_text: null }, recommendations: [{ id: 'rec', final_text: 'Signed repair advice', signed_at: '2026-11-11T00:00:00Z' }], cost_estimates: [] } } })
describe('Shared report publication', () => {
  test('renders immutable snapshot without re-reading mutable report tables', async () => {
    const html = await render()
    assert.match(html, /Signed snapshot title/)
    assert.match(html, /Signed repair advice/)
    assert.match(html, /No intrusive testing/)
    assert.doesNotMatch(html, /Later live edit/)
    assert.deepEqual(tables, ['share_tokens'])
  })
  test('revoked links never expose snapshot findings', async () => { share!.revoked_at = '2026-11-11T00:00:00Z'; const html = await render(); assert.match(html, /Link revoked/); assert.doesNotMatch(html, /Snapshot finding/) })
  test('expired links never expose snapshot findings', async () => { share!.expires_at = '2000-01-01T00:00:00Z'; const html = await render(); assert.match(html, /Link expired/); assert.doesNotMatch(html, /Snapshot finding/) })
  test('legacy links without snapshot require renewal instead of serving live data', async () => { share!.snapshot = null; const html = await render(); assert.match(html, /renew|new link/i); assert.deepEqual(tables, ['share_tokens']) })
})
