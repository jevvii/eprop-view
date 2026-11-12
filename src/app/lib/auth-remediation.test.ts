import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadServerModule } from './test-support/server-module'

type Limiter = { enforceRateLimit: (key: string, limit: number, seconds: number) => Promise<void> }
test('rate limiting uses a server-controlled store before the user is authenticated', async () => {
  let serviceCalls = 0
  const loadedModule = loadServerModule<Limiter>(new URL('./rate-limit.ts', import.meta.url), {
    './supabase/server': { createClient: async () => ({ rpc: async () => ({ data: null, error: { message: 'anonymous denied' } }) }) },
    './supabase/service': { createServiceClient: () => { serviceCalls++; return { rpc: async () => ({ data: true, error: null }) } } },
  })
  await loadedModule.enforceRateLimit('login:hashed-account', 10, 900)
  assert.equal(serviceCalls, 1)
})

test('unavailable and exhausted rate limits fail closed', async () => {
  for (const result of [{ data: false, error: null }, { data: null, error: { message: 'store unavailable' } }]) {
    const store = { rpc: async () => result }
    const loadedModule = loadServerModule<Limiter>(new URL('./rate-limit.ts', import.meta.url), {
      './supabase/server': { createClient: async () => store },
      './supabase/service': { createServiceClient: () => store },
    })
    await assert.rejects(loadedModule.enforceRateLimit('login:hashed-account', 10, 900), /RATE_LIMIT/)
  }
})

test('callback only redirects to same-origin local paths', async () => {
  const loadedModule = loadServerModule<{ GET: (request: Request) => Promise<Response> }>(new URL('../auth/callback/route.ts', import.meta.url), {
    '@/app/lib/supabase/server': { createClient: async () => ({ auth: { exchangeCodeForSession: async () => ({ error: null }) } }) },
  })
  for (const next of ['//example.org', '/\\example.org', 'https://example.org', '\\example.org']) {
    const response = await loadedModule.GET(new Request(`https://eprop.test/auth/callback?next=${encodeURIComponent(next)}`))
    assert.equal(new URL(response.headers.get('location')!).origin, 'https://eprop.test')
  }
  const valid = await loadedModule.GET(new Request('https://eprop.test/auth/callback?next=%2Freports%3Fstatus%3Dcompleted'))
  assert.equal(valid.headers.get('location'), 'https://eprop.test/reports?status=completed')
})
