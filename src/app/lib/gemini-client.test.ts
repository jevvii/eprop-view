import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadServerModule } from './test-support/server-module'

type Client = typeof import('./ai/gemini')
function client(key: string, fetch: typeof globalThis.fetch) {
  return loadServerModule<Client>(new URL('./ai/gemini.ts', import.meta.url), {}, { process: { env: { GEMINI_API_KEY: key } }, fetch })
}

test('Vercel sensitive placeholders are not treated as a configured Gemini key', () => {
  assert.equal(client('[SENSITIVE]', globalThis.fetch).isGeminiConfigured(), false)
})

test('quota exhaustion advances to the fallback model with validated JSON', async () => {
  const requested: string[] = []
  const api = client('unit-test-key', async (url) => {
    requested.push(String(url))
    return requested.length === 1
      ? new Response('{}', { status: 429 })
      : Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"inspect first"}' }] } }] })
  })
  const result = await api.generateStructured({ prompt: 'Test', schema: { type: 'OBJECT' }, parse: raw => raw as { answer: string } })
  assert.equal(requested.length, 2)
  assert.match(requested[1], /gemini-3\.5-flash-lite/)
  assert.equal(result.value.answer, 'inspect first')
})

test('malformed provider responses fail before retrying or persisting', async () => {
  for (const text of ['not JSON', '{"answer":0}']) {
    let calls = 0
    const api = client('unit-test-key', async () => {
      calls++
      return Response.json({ candidates: [{ content: { parts: [{ text }] } }] })
    })
    await assert.rejects(api.generateStructured({ prompt: 'Test', schema: {}, parse: raw => {
      if (typeof (raw as { answer: unknown }).answer !== 'string') throw new Error('Expected a useful sentence')
      return raw
    } }), /valid JSON|failed validation/)
    assert.equal(calls, 1)
  }
})

test('temporary provider failures advance once to the secondary model', async () => {
  for (const first of [503, 502, 504, 500, 408, 'timeout'] as const) {
    let calls = 0
    const api = client('unit-test-key', async () => {
      calls++
      if (calls === 1) {
        if (first === 'timeout') throw new DOMException('Deadline exceeded', 'TimeoutError')
        return Response.json({ error: { message: 'Temporary failure' } }, { status: first })
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Review required"}' }] } }] })
    })
    const result = await api.generateStructured({ prompt: 'Test', schema: {}, parse: raw => raw as { answer: string } })
    assert.equal(calls, 2)
    assert.equal(result.model, 'gemini-3.5-flash-lite')
  }
})

test('authentication and request errors never retry against another model', async () => {
  for (const status of [400, 401, 403, 404]) {
    let calls = 0
    const api = client('unit-test-key', async () => {
      calls++
      return Response.json({ error: { message: 'Invalid request or authorization' } }, { status })
    })
    await assert.rejects(api.generateStructured({ prompt: 'Test', schema: {}, parse: raw => raw }))
    assert.equal(calls, 1)
  }
})

test('Gemini 3 requests omit deprecated temperature controls', async () => {
  const api = client('unit-test-key', async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(Object.hasOwn(body.generationConfig, 'temperature'), false)
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Reviewed"}' }] } }] })
  })
  await api.generateStructured({ prompt: 'Test', schema: {}, temperature: 0.4, parse: raw => raw })
})

test('an overloaded primary and secondary still reach the third model', async () => {
  let calls = 0
  const api = client('unit-test-key', async () => {
    calls++
    if (calls <= 2) {
      return Response.json({ error: { message: 'This model is currently experiencing high demand.' } }, { status: 503 })
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"third model answered"}' }] } }] })
  })
  const result = await api.generateStructured({
    prompt: 'Test',
    schema: {},
    parse: raw => raw as { answer: string },
  })
  assert.equal(calls, 3)
  assert.equal(result.model, 'gemini-3.1-flash-lite')
  assert.equal(result.value.answer, 'third model answered')
})

test('a 5xx across the whole chain reads as provider overload, not missing configuration', async () => {
  const api = client('unit-test-key', async () =>
    Response.json({ error: { message: 'high demand' } }, { status: 503 })
  )
  await assert.rejects(
    api.generateStructured({ prompt: 'Test', schema: {}, parse: raw => raw }),
    /temporarily overloaded/
  )
})
