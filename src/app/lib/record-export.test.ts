import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { csvCell, readAllRows, toCsv } from './record-export'

describe('Spreadsheet-safe CSV and complete record reads', () => {
  test('neutralizes formula prefixes, including whitespace, while preserving numeric values', () => {
    for (const input of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', ' \t=HYPERLINK("url")']) assert(csvCell(input).includes("'"))
    assert.equal(csvCell(-42), '-42')
    assert.equal(toCsv(['Notes'], [['comma, and "quote"'], [null]]), 'Notes\r\n"comma, and ""quote"""\r\n')
  })
  test('reads beyond the database response cap without omitting later pages', async () => {
    const source = Array.from({ length: 1001 }, (_, id) => ({ id }))
    const result = await readAllRows(async (from, to) => ({ data: source.slice(from, to + 1), error: null }))
    assert.equal(result.length, 1001)
    assert.equal(result[1000].id, 1000)
  })
  test('a failed later page prevents an apparently complete export', async () => {
    await assert.rejects(readAllRows(async from => from === 0
      ? { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null }
      : { data: null, error: new Error('database unavailable') }), /unavailable/)
  })
})

test('report CSV excludes signatures that predate the current report content', async () => {
  const { loadServerModule } = await import('./test-support/server-module')
  const report = {
    report_id: 'R-1', title: 'Column review', date: '2026-11-12', status: 'open',
    content_updated_at: '2026-11-12T12:00:00Z',
    recommendations: [
      { status: 'signed', final_text: 'STALE_REVIEW', provenance: 'engineer', signed_at: '2026-11-11T12:00:00Z' },
      { status: 'signed', final_text: 'CURRENT_REVIEW', provenance: 'engineer', signed_at: '2026-11-12T13:00:00Z' },
    ],
  }
  const query = { select: () => query, order: () => query, range: async () => ({ data: [report], error: null }) }
  const api = loadServerModule<typeof import('../actions/export')>(new URL('../actions/export.ts', import.meta.url), {
    '@/app/lib/dal': { requireCapabilityCheck: async () => ({}) },
    '@/app/lib/supabase/server': { createClient: async () => ({ from: () => query }) },
    '@/app/lib/record-export': { readAllRows, toCsv },
  })
  const result = await api.exportReportsCsv()
  assert.match(result.csv, /CURRENT_REVIEW/)
  assert.doesNotMatch(result.csv, /STALE_REVIEW/)
})
