import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFunction } from 'node:vm'
import ts from 'typescript'

type Row = Record<string, unknown>
const auditId = '11111111-1111-4111-8111-111111111111'
const state = {
  tables: {} as Record<string, Row[]>, files: new Map<string, Blob>(),
  uploadError: false, removeError: false, rpcError: false, corruptCopy: false,
  failedTable: '', removed: [] as string[], rpcCalls: [] as string[], role: 'admin',
}
function from(table: string) {
  let mode = 'read', values: Row | Row[] = {}, start = 0, end = Infinity
  const filters: ((r: Row) => boolean)[] = []
  const execute = async () => {
    if (state.failedTable === table) return { data: null, error: new Error('read unavailable') }
    const all = state.tables[table] ??= []
    const found = all.filter(r => filters.every(f => f(r)))
    if (mode === 'update') found.forEach(r => Object.assign(r, values))
    if (mode === 'delete') state.tables[table] = all.filter(r => !found.includes(r))
    if (mode === 'upsert' || mode === 'insert') {
      for (const row of Array.isArray(values) ? values : [values]) {
        const existing = mode === 'upsert' ? all.find(r => r.bucket_id === row.bucket_id && r.object_path === row.object_path) : undefined
        if (existing) Object.assign(existing, row)
        else all.push({ id: crypto.randomUUID(), ...row })
      }
    }
    return { data: found.slice(start, end + 1), error: null }
  }
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(r => r[key] === value); return query },
    in: (key: string, values: unknown[]) => { filters.push(r => values.includes(r[key])); return query },
    lt: (key: string, value: string) => { filters.push(r => String(r[key]) < value); return query },
    order: () => query, limit: (n: number) => { end = n - 1; return query },
    range: (a: number, b: number) => { start = a; end = b; return query },
    update: (v: Row) => { mode = 'update'; values = v; return query },
    insert: (v: Row | Row[]) => { mode = 'insert'; values = v; return query },
    upsert: (v: Row | Row[]) => { mode = 'upsert'; values = v; return query },
    delete: () => { mode = 'delete'; return query },
    single: async () => { const r = await execute(); return { ...r, data: r.data?.[0] ? structuredClone(r.data[0]) : null } },
    maybeSingle: async () => { const r = await execute(); return { ...r, data: r.data?.[0] ? structuredClone(r.data[0]) : null } },
    then: (resolve: (r: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
  }
  return query
}
const client = {
  from,
  rpc: async (name: string, args: Row) => {
    state.rpcCalls.push(name)
    if (state.rpcError) return { data: null, error: new Error('metadata unavailable') }
    const row = state.tables.storage_audit.find(r => r.id === args.p_audit_id)!
    const oldBucket = row.bucket_id, oldPath = row.object_path
    Object.assign(row, { bucket_id: args.p_bucket_id, object_path: args.p_object_path, storage_class: args.p_storage_class })
    for (const image of state.tables.inspection_images ?? []) {
      if ((image.storage_bucket ?? 'inspection-images') === oldBucket && image.storage_path === oldPath) Object.assign(image, { storage_bucket: args.p_bucket_id, storage_path: args.p_object_path })
    }
    return { data: row, error: null }
  },
  storage: { from: (bucket: string) => ({
    download: async (path: string) => ({ data: state.files.get(`${bucket}/${path}`) ?? null, error: state.files.has(`${bucket}/${path}`) ? null : new Error('missing object') }),
    upload: async (path: string, blob: Blob) => {
      if (state.uploadError) return { data: null, error: new Error('archive full') }
      state.files.set(`${bucket}/${path}`, state.corruptCopy ? new Blob(['corrupt']) : blob)
      return { data: { path }, error: null }
    },
    remove: async (paths: string[]) => {
      if (state.removeError) return { error: new Error('remove unavailable') }
      for (const path of paths) { state.removed.push(`${bucket}/${path}`); state.files.delete(`${bucket}/${path}`) }
      return { error: null }
    },
    list: async (prefix: string, options: { offset: number; limit: number }) => {
      const names = new Map<string, Row>()
      for (const [key, blob] of state.files) {
        if (!key.startsWith(`${bucket}/${prefix ? `${prefix}/` : ''}`)) continue
        const tail = key.slice(bucket.length + 1 + (prefix ? prefix.length + 1 : 0)), [first, ...rest] = tail.split('/')
        names.set(first, rest.length ? { name: first, id: null, metadata: null } : { name: first, id: key, metadata: { size: blob.size }, created_at: '2025-01-01T00:00:00Z' })
      }
      return { data: [...names.values()].slice(options.offset, options.offset + options.limit), error: null }
    },
  }) },
}
function loadAction(file: string) {
  const url = new URL(`../actions/${file}.ts`, import.meta.url), filename = fileURLToPath(url), requireAction = createRequire(url)
  const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } }).outputText
  const mod = { exports: {} as Record<string, (...args: never[]) => Promise<unknown>> }
  compileFunction(output, ['exports', 'require', 'module', '__filename', '__dirname'], { filename })(mod.exports, (name: string) => {
    if (name === '@/app/lib/supabase/server') return { createClient: async () => client }
    if (name === '@/app/lib/dal') return { requireRole: async () => { if (state.role !== 'admin') throw new Error('Forbidden'); return { userId: auditId } } }
    if (name === 'next/cache') return { revalidatePath: () => {} }
    if (name === '@/app/lib/audit') return { recordAuditEvent: async () => {} }
    if (name.startsWith('@/')) return requireAction(fileURLToPath(new URL(`../../${name.slice(2)}.ts`, import.meta.url)))
    return requireAction(name)
  }, mod, filename, dirname(filename))
  return mod.exports as unknown as {
    updateStorageClass(id: string, level: string): Promise<void>
    syncStorageAudit(): Promise<{ synced: number; orphaned: number }>
    getStorageSummary(): Promise<{ totalBytes: number }>
    applyStorageLifecyclePolicies(): Promise<{ archived: number }>
  }
}
const actions = loadAction('storage')
beforeEach(() => {
  state.tables = {
    storage_audit: [{ id: auditId, bucket_id: 'inspection-images', object_path: 'inspection/user/evidence.jpg', storage_class: 'standard', uploaded_at: '2025-01-01T00:00:00Z', is_orphan: false, size_bytes: 8 }],
    inspection_images: [{ id: auditId, inspection_id: auditId, storage_path: 'inspection/user/evidence.jpg', storage_bucket: 'inspection-images' }], ar_anchors: [], ai_models: [],
  }
  state.files = new Map([['inspection-images/inspection/user/evidence.jpg', new Blob(['evidence'], { type: 'image/jpeg' })]])
  state.uploadError = state.removeError = state.rpcError = state.corruptCopy = false
  state.failedTable = ''; state.removed = []; state.rpcCalls = []; state.role = 'admin'
})
describe('Actual storage archival actions', () => {
  test('an upload error leaves the original evidence and metadata intact', async () => {
    state.uploadError = true
    await assert.rejects(actions.updateStorageClass(auditId, 'archive'), /archive|upload/i)
    assert.equal(await state.files.get('inspection-images/inspection/user/evidence.jpg')?.text(), 'evidence')
    assert.equal(state.tables.inspection_images[0].storage_bucket, 'inspection-images')
    assert.deepEqual(state.removed, [])
  })
  test('a corrupt copy never replaces or removes the original', async () => {
    state.corruptCopy = true
    await assert.rejects(actions.updateStorageClass(auditId, 'archive'), /verif|copy/i)
    assert(state.files.has('inspection-images/inspection/user/evidence.jpg'))
    assert.equal(state.tables.storage_audit[0].storage_class, 'standard')
  })
  test('a metadata failure preserves the original and its readable pointer', async () => {
    state.rpcError = true
    await assert.rejects(actions.updateStorageClass(auditId, 'archive'), /metadata/i)
    assert(state.files.has('inspection-images/inspection/user/evidence.jpg'))
    assert.equal(state.tables.inspection_images[0].storage_bucket, 'inspection-images')
  })
  test('successful archival switches both bucket and path to the verified copy', async () => {
    await actions.updateStorageClass(auditId, 'archive')
    const image = state.tables.inspection_images[0]
    assert.equal(image.storage_bucket, 'reports-archive')
    assert.equal(await state.files.get(`${image.storage_bucket}/${image.storage_path}`)?.text(), 'evidence')
    assert.equal(state.files.has('inspection-images/inspection/user/evidence.jpg'), false)
  })
  test('failed source cleanup retains readable archived evidence and reports the duplicate', async () => {
    state.removeError = true
    await assert.rejects(actions.updateStorageClass(auditId, 'archive'), /retained|cleanup/i)
    const image = state.tables.inspection_images[0]
    assert.equal(await state.files.get(`${image.storage_bucket}/${image.storage_path}`)?.text(), 'evidence')
    assert(state.files.has('inspection-images/inspection/user/evidence.jpg'))
  })
  test('sync traverses folders without inventing folder assets or file sizes', async () => {
    const result = await actions.syncStorageAudit()
    assert.equal(result.synced, 1)
    assert.equal(result.orphaned, 0)
    assert.deepEqual(state.tables.storage_audit.map(r => r.object_path), ['inspection/user/evidence.jpg'])
    assert.equal(state.tables.storage_audit[0].size_bytes, 8)
  })
  test('summary errors are surfaced instead of represented as empty storage', async () => {
    state.failedTable = 'storage_audit'
    await assert.rejects(actions.getStorageSummary(), /unavailable/)
  })
  test('lifecycle archives actual bytes rather than changing a database label', async () => {
    const result = await actions.applyStorageLifecyclePolicies()
    assert.equal(result.archived, 1)
    assert.equal(state.tables.inspection_images[0].storage_bucket, 'reports-archive')
    assert.equal(state.files.has('inspection-images/inspection/user/evidence.jpg'), false)
  })
})
