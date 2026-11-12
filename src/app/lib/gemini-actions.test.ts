import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadServerModule } from './test-support/server-module'
import { checkDivergence, tableEstimate } from './structural/cost-table'
import { computeFinalDamageScore, scoreToRiskLevel } from './damage-score'

const imageId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const input: Parameters<typeof import('../actions/gemini-analysis').suggestRepairCost>[0] = { damageType: 'crack', severity: 'medium', elementType: 'column', context: 'Measured surface crack; quantities require a site visit.' }

function actions(response: unknown, unavailable = false) {
  class UnavailableError extends Error { code = "transport" }
  let writes = 0
  const client = {
    rpc: async (_name:string,args:{p_rows?:Record<string,unknown>[]}) => {
      writes++
      return {data:(args.p_rows??[]).map(row=>({...row,id:imageId,provenance:'gemini'})),error:null}
    },
    from: (table: string) => {
      const rows = table === 'inspection_images' ? [{ id: imageId, inspection_id: imageId, storage_path: 'evidence.jpg', storage_bucket: 'inspection-images', inspections: { lead_inspector_id: userId } }] : []
      const query = {
        select: () => query, eq: () => query, in: () => query, order: () => query, limit: () => query,
        single: async () => ({ data: rows[0], error: null }), maybeSingle: async () => ({ data: rows[0], error: null }),
        delete: () => { writes++; return query }, insert: () => { writes++; return query }, update: () => { writes++; return query },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return query
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob(['photo'], { type: 'image/jpeg' }), error: null }) }) },
  }
  const api = loadServerModule<typeof import('../actions/gemini-analysis')>(new URL('../actions/gemini-analysis.ts', import.meta.url), {
    '@/app/lib/supabase/server': { createClient: async () => client },
    '@/app/lib/supabase/service': { createServiceClient: () => client },
    '@/app/lib/dal': { requireRole: async () => ({ userId, role: 'inspector' }) },
    '@/app/lib/rate-limit': { enforceRateLimit: async () => {} },
    '@/app/lib/audit': { recordAuditEvent: async () => {} },
    '@/app/lib/structural/cost-table': { checkDivergence, tableEstimate },
    '@/app/lib/damage-score': { computeFinalDamageScore, scoreToRiskLevel },
    '@/app/lib/ai/gemini': {
      GEMINI_DATA_NOTICE: 'Testing notice', isGeminiConfigured: () => true,
      GeminiUnavailableError: UnavailableError,
      generateStructured: async (options: { parse: (raw: unknown) => unknown }) => {
        if (unavailable) throw new UnavailableError('Network unavailable')
        return { value: options.parse(response), model: 'gemini-3.8-flash' }
      },
    },
  })
  return { api, writes: () => writes }
}

test('rejects reversed or internally inconsistent repair cost ranges', async () => {
  for (const range of [{ low_php: 100, likely_php: 50, high_php: 80 }, { low_php: 10, likely_php: 100, high_php: 80 }]) {
    const { api } = actions({ ...range, basis: 'Repair quantities are provisional.', confidence: 0.7 })
    await assert.rejects(api.suggestRepairCost(input as Parameters<typeof api.suggestRepairCost>[0]))
  }
})

test('recommendation and narrative output identify actual Gemini provenance', async () => {
  const recommendation = actions({ action: 'Arrange engineer inspection.', rationale: 'A column defect was observed; extent needs measurement.', urgency: 'scheduled', steps: ['Measure the crack and review loading.'] })
  const result = await recommendation.api.draftRecommendation(input as Parameters<typeof recommendation.api.draftRecommendation>[0])
  assert.equal(result.provenance, 'gemini')
  assert.match(result.rationale, /column/)
  const narrative = actions({ narrative: 'A surface defect was recorded. No crack width or concrete strength was measured from the image.' })
  const written = await narrative.api.draftReportNarrative({ title: 'Column survey', riskScore: 5, riskLevel: 'moderate', findings: 'Visual evidence only', detections: [{ damageType: 'crack', severity: 'medium' }] })
  assert.equal(written.provenance, 'gemini')
})

test('rejects invalid bounding boxes before any detection mutation', async () => {
  const { api, writes } = actions({ damage_type: 'crack', severity: 'medium', severity_score: 50, confidence: 0.7, summary: 'Visible surface discontinuity.', crack_width_mm: null, bbox: { x: 0.8, y: 0.2, width: 0.5, height: 0.4 } })
  await assert.rejects(api.analyzeImageWithGemini(imageId))
  assert.equal(writes(), 0)
})

test('uncalibrated images cannot create physical crack-width readings', async () => {
  const { api, writes } = actions({ damage_type: 'crack', severity: 'medium', severity_score: 50, confidence: 0.7, summary: 'Visible surface discontinuity.', crack_width_mm: 3.5, bbox: null })
  await assert.rejects(api.analyzeImageWithGemini(imageId))
  assert.equal(writes(), 0)
})

test('valid vision result is saved as Gemini output, with no fabricated measurement',async()=>{
 const {api,writes}=actions({damage_type:'crack',severity:'medium',severity_score:50,confidence:0.7,summary:'Visible surface discontinuity; measure it during field review.',crack_width_mm:null,bbox:{x:0.1,y:0.1,width:0.2,height:0.4}})
 const result=await api.analyzeImageWithGemini(imageId)
 assert.equal(result.provenance,'gemini')
 assert.equal(result.detections[0].damage_type,'crack')
 assert.equal(result.detections[0].crack_width_mm,undefined)
 assert.ok(writes()>0)
})


test('empty drafting output is rejected instead of presented as meaningful analysis', async () => {
  const recommendation = actions({ action: '', rationale: '', urgency: 'routine', steps: [] })
  await assert.rejects(recommendation.api.draftRecommendation(input))
  const narrative = actions({ narrative: '' })
  await assert.rejects(narrative.api.draftReportNarrative({ title: 'Column survey', riskScore: 5, riskLevel: 'moderate' }))
})

test('no observed defect does not produce a repair quotation', async () => {
  const { api } = actions({})
  const result = await api.suggestRepairCost({ ...input, damageType: 'none' })
  assert.equal(result.model, null)
  assert.equal(result.aiLikelyPhp, null)
  assert.equal(result.tableEstimatePhp, 0)
})

test('negative vision result persists no new defect rows', async () => {
  const { api } = actions({ damage_type: 'none', severity: 'low', severity_score: 0, confidence: 0.7, summary: 'No visible defect pattern in this photograph.', crack_width_mm: null, bbox: null })
  const result = await api.analyzeImageWithGemini(imageId)
  assert.equal(result.provenance, 'gemini')
  assert.equal(result.detections.length, 0)
})


test('missing fallback configuration cannot masquerade as a successful empty analysis', async () => {
  const { api, writes } = actions({}, true)
  await assert.rejects(api.analyzeImageWithGemini(imageId), /no active heuristic configuration/)
  assert.equal(writes(), 0)
})
