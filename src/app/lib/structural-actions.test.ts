import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import ts from 'typescript'
const id = '11111111-1111-4111-8111-111111111111'
const state = { role: 'engineer', writes: 0 }
const sourceUrl = new URL('../actions/structural.ts', import.meta.url)
const requireSource = createRequire(sourceUrl), sourcePath = fileURLToPath(sourceUrl)
const boundaries = {
  requireRole: async (allowed: string[]) => { if (!allowed.includes(state.role)) throw new Error('Access denied'); return { role: state.role, userId: id } },
  createClient: async () => ({ from: (table: string) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => q,
      update: () => { state.writes++; return q }, upsert: () => { state.writes++; return q },
      single: async () => ({ data: { id }, error: null }),
      maybeSingle: async () => ({ data: table === 'checklist_templates' ? { code: 'flood_map', version: 1, items: [{ key: 'in_flood_zone' }, { key: 'drainage_adequate' }] } : null, error: null }) }
    return q
  } }),
  recordAuditEvent: async () => {}, enforceRateLimit: async () => {},
}
const compiled = ts.transpileModule(readFileSync(sourceUrl, 'utf8'), {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
}).outputText
const loaded = { exports: {} as {
  saveChecklistResponse: (input: unknown) => Promise<unknown>
  updateDetectionCrackTaxonomy: (input: unknown) => Promise<unknown>
} }
compileFunction(compiled, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: sourcePath })(loaded.exports,
  (specifier: string) => ['@/app/lib/dal', '@/app/lib/supabase/server', '@/app/lib/audit', '@/app/lib/rate-limit'].includes(specifier)
    ? boundaries : requireSource(specifier), loaded, sourcePath, dirname(sourcePath))
beforeEach(() => { state.role = 'engineer'; state.writes = 0 })
describe('Structural action approval and checklist validation', () => {
  test('inspectors cannot finalize the engineer crack classification', async () => {
    state.role = 'inspector'
    await assert.rejects(loaded.exports.updateDetectionCrackTaxonomy({ detectionId: id, widthMm: 0.2 }), /Access denied/)
    assert.equal(state.writes, 0)
  })
  test('refuses incomplete or unconfirmed auto-prefilled checklists', async () => {
    await assert.rejects(loaded.exports.saveChecklistResponse({ inspectionId: id, templateCode: 'flood_map', responses: [
      { key: 'in_flood_zone', answer: 'yes', prefilled: true }, { key: 'drainage_adequate', answer: 'no' },
    ] }), /confirm|prefill/i)
    assert.equal(state.writes, 0)
  })
  test('requires exactly the versioned template items, without duplicates', async () => {
    await assert.rejects(loaded.exports.saveChecklistResponse({ inspectionId: id, templateCode: 'flood_map', responses: [
      { key: 'in_flood_zone', answer: 'yes' }, { key: 'in_flood_zone', answer: 'no' },
    ] }), /template|duplicate/i)
    assert.equal(state.writes, 0)
  })
  test('persists a complete checklist explicitly confirmed by the user', async () => {
    await loaded.exports.saveChecklistResponse({ inspectionId: id, templateCode: 'flood_map', responses: [
      { key: 'in_flood_zone', answer: 'yes', prefilled: false }, { key: 'drainage_adequate', answer: 'no' },
    ] })
    assert.equal(state.writes, 1)
  })
})
