import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

const reportId = '11111111-1111-4111-8111-111111111111'
const recommendationId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const calls: { name: string; args: Record<string, unknown> }[] = []
let rpcError: Error | null = null
let role = 'engineer'
function loadAction(name: string, replacements: Record<string, unknown> = {}) {
  const url = new URL(`../actions/${name}.ts`, import.meta.url)
  const nativeRequire = createRequire(url)
  const loaded = { exports: {} as Record<string, (...args: never[]) => Promise<unknown>> }
  const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const boundary = {
    requireRole: async (allowed: string[]) => { if (!allowed.includes(role)) throw new Error('Access denied'); return { userId, role } },
    createClient: async () => ({
      from: () => { throw new Error('Report lifecycle must use the atomic RPC, never direct table writes') },
      rpc: async (rpc: string, args: Record<string, unknown>) => {
        calls.push({ name: rpc, args })
        return { data: rpc === 'save_report_revision' ? { report: { id: reportId, status: 'open' }, revisionNumber: 2 } : { id: recommendationId, status: 'signed' }, error: rpcError }
      },
    }),
    recordAuditEvent: async () => {},
  }
  compileFunction(output, ['exports', 'require', 'module'], { filename: url.pathname })(loaded.exports, (specifier: string) => {
    if (specifier in replacements) return replacements[specifier]
    if (['@/app/lib/dal', '@/app/lib/supabase/server', '@/app/lib/audit'].includes(specifier)) return boundary
    if (specifier === '@/app/lib/structural/cost-table') return nativeRequire('../lib/structural/cost-table.ts')
    return nativeRequire(specifier)
  }, loaded)
  return loaded.exports
}
const actions = loadAction('reports-v2')
beforeEach(() => { calls.length = 0; rpcError = null; role = 'engineer' })

describe('Report lifecycle action boundaries', () => {
  test('edits pass explicit reopen and expected version to one atomic database operation', async () => {
    const expected = '2026-11-11T10:00:00.000Z'
    await actions.updateReportWithRevision({ reportId, title: 'Corrected finding', reopen: true, expectedUpdatedAt: expected } as never)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].name, 'save_report_revision')
    assert.equal(calls[0].args.p_reopen, true)
    assert.equal(calls[0].args.p_expected_updated_at, expected)
    assert.deepEqual(calls[0].args.p_changes, { title: 'Corrected finding' })
  })
  test('database lock and concurrent-edit failures reach the caller', async () => {
    rpcError = new Error('Report changed since it was opened. Reload before saving.')
    await assert.rejects(actions.updateReportWithRevision({ reportId, title: 'Stale edit' } as never), /Reload before saving/)
  })
  test('signing delegates cost validation and signature to an atomic RPC', async () => {
    await actions.signRecommendation({ recommendationId, finalText: 'Inspect reinforcement before repair.' } as never)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].name, 'sign_report_recommendation')
    assert.deepEqual(calls[0].args, { p_recommendation_id: recommendationId, p_final_text: 'Inspect reinforcement before repair.' })
  })
  test('an unconfirmed divergent estimate prevents the signature', async () => {
    rpcError = new Error('Confirm divergent cost estimates before signing.')
    await assert.rejects(actions.signRecommendation({ recommendationId, finalText: 'Repair.' } as never), /Confirm divergent/)
  })
  test('inspectors cannot call report editing or signing actions', async () => {
    role = 'inspector'
    await assert.rejects(actions.updateReportWithRevision({ reportId, title: 'Forbidden' } as never), /Access denied/)
    await assert.rejects(actions.signRecommendation({ recommendationId, finalText: 'Forbidden' } as never), /Access denied/)
    assert.equal(calls.length, 0)
  })
  test('sharing snapshots via the database rather than inserting a live pointer', async () => {
    await actions.createShareToken(reportId as never, 14 as never)
    assert.equal(calls[0].name, 'create_report_share')
    assert.equal(calls[0].args.p_report_id, reportId)
    assert.match(String(calls[0].args.p_token), /^[A-Za-z0-9_-]{32}$/)
  })
})

describe('Report share management boundaries', () => {
  test('staff can list only the requested report links without loading snapshots', async () => {
    let selected = '', selectedTable = '', scoped = ''
    const links = [{ id: recommendationId, report_id: reportId, token: 'A'.repeat(32), revoked_at: null }]
    const query = {
      select: (value: string) => { selected = value; return query },
      eq: (key: string, value: string) => { assert.equal(key, 'report_id'); scoped = value; return query },
      order: () => query,
      limit: async () => ({ data: links, error: null }),
    }
    const api = loadAction('reports-v2', {
      '@/app/lib/supabase/server': { createClient: async () => ({ from: (table: string) => { selectedTable = table; return query } }) },
    })
    const result = await api.getReportShareTokens(reportId as never)
    assert.equal(selectedTable, 'share_tokens')
    assert.equal(scoped, reportId)
    assert(!selected.includes('snapshot') && !selected.includes('*'))
    assert.deepEqual(result, links)
  })
  test('viewers and inspectors cannot enumerate share links', async () => {
    for (const denied of ['viewer', 'inspector']) {
      role = denied
      await assert.rejects(actions.getReportShareTokens(reportId as never), /Access denied/)
    }
  })
  test('failed share reads reach the interface instead of looking like no links', async () => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: async () => ({ data: null, error: new Error('Share store unavailable') }) }
    const api = loadAction('reports-v2', { '@/app/lib/supabase/server': { createClient: async () => ({ from: () => query }) } })
    await assert.rejects(api.getReportShareTokens(reportId as never), /Share store unavailable/)
  })
})
