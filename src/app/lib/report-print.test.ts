import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const publication = {
  recommendations: [{ id: 'r1', status: 'signed', final_text: 'Signed reinforcement repair plan', signed_at: '2026-11-12T01:00:00Z', signed_by: 'reviewer', provenance: 'engineer' }],
  limitation: { standard_exclusions: ['No destructive testing'], free_text: 'Basement access restricted', element_notes: { 'Column A': 'Cover not removed' } },
  costs: [{ id: 'cost', table_estimate_php: 12000, ai_low_php: 10000, ai_likely_php: 13000, ai_high_php: 16000, provenance: 'gemini', divergence_flag: false }],
  detections: [{ id: 'd1', damage_type: 'crack', severity: 'high', severity_score: 70, confidence: 0.88, provenance: 'heuristic', verified_by: 'reviewer', crack_width_mm: 0.4, crack_width_band: 'medium', crack_orientation: 'vertical', crack_pattern: 'single', crack_cause: 'settlement', aci_reference: 'Exposure serviceability guidance' }],
  anchors: [{ id: 'anchor', label: 'Column photograph', damage_type: 'crack', image_url: '/evidence/anchor.jpg' }],
  images: [{ id: 'image', caption: 'Inspection image', signed_url: '/evidence/photo.jpg' }],
}
const url = new URL('../../components/reports/print-report.tsx', import.meta.url)
const nativeRequire = createRequire(url)
const loaded = { exports: {} as { PrintReport: ComponentType<Record<string, unknown>> } }
const source = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
compileFunction(source, ['exports', 'require', 'module'], { filename: url.pathname })(loaded.exports, (specifier: string) => {
  if (specifier === '@tanstack/react-query') return { useQueries: () => [{ data: publication, isSuccess: true, isError: false }] }
  if (specifier === '@/app/actions/reports-v2') return { getReportPublication: async () => publication }
  if (specifier === '@/app/lib/structural/cost-table') return nativeRequire('../../app/lib/structural/cost-table.ts')
  if (specifier === '@/app/lib/print-evidence') return nativeRequire('../../app/lib/print-evidence.ts')
  return nativeRequire(specifier)
}, loaded)
const render = () => renderToStaticMarkup(createElement(loaded.exports.PrintReport, {
  reports: [{ id: 'report', report_id: 'RPT-1', title: 'Reviewed structural survey', date: '2026-11-11', location: 'Column A', status: 'completed', risk_score: 7, reviewed_by: 'reviewer', reviewed_at: '2026-11-12T02:00:00Z', key_findings: 'Recorded finding', findings_provenance: 'engineer' }],
  projectName: 'Fixture', generatedBy: 'Reviewer', stats: { open: 0, in_review: 0, critical: 0, completed: 1 },
}))
describe('Printed review content', () => {
  test('prints signed advice, limitations, costs and crack taxonomy', () => {
    const html = render()
    for (const text of ['Signed reinforcement repair plan', 'No destructive testing', 'Basement access restricted', 'Cover not removed', '12,000', 'medium', 'vertical', 'settlement']) assert.ok(html.includes(text), `missing ${text}`)
  })
  test('identifies heuristic output and prints actual evidence without claiming certification', () => {
    const html = render()
    assert.match(html, /Heuristic response strength/)
    assert.match(html, /method heuristic/)
    assert.match(html, /evidence\/photo\.jpg/)
    assert.match(html, /evidence\/anchor\.jpg/)
    assert.doesNotMatch(html, /Certification of Accuracy|Automated AI Structural Damage Diagnostics/)
    assert.match(html, /do not certify structural safety/)
    // Server markup cannot mark photographs ready before browser decoding.
    assert.match(html, /data-print-ready="false"/)
  })
})
