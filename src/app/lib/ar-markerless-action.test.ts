import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFunction } from 'node:vm'
import sharp from 'sharp'
import ts from 'typescript'
import type { ARAnchor, ARSession, Role } from '@/app/types'

const inspectionId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const userId = '33333333-3333-4333-8333-333333333333'
const otherId = '44444444-4444-4444-8444-444444444444'
type Table = 'ar_anchors' | 'ar_sessions' | 'inspections'
type Row = Record<string, unknown>
const state = {
  actor: { userId, role: 'inspector' as Role },
  tables: { ar_anchors: [] as Row[], ar_sessions: [] as Row[], inspections: [] as Row[] },
  insertError: null as Error | null,
  inserts: 0,
  uploads: 0,
  clientCalls: 0,
  removed: [] as string[],
  files: new Map<string, Buffer>(),
}

function from(table: Table) {
  const filters = new Map<string, unknown>()
  const included = new Map<string, unknown[]>()
  let payload: Row | null = null
  let orderKey: string | null = null
  let ascending = true
  let count = Infinity
  const execute = async () => {
    if (payload) {
      state.inserts++
      if (state.insertError) return { data: null, error: state.insertError }
      const row = { id: '66666666-6666-4666-8666-666666666666', ...payload }
      state.tables[table].push(row)
      return { data: row, error: null }
    }
    let rows = state.tables[table].filter((row) =>
      [...filters].every(([key, value]) => row[key] === value) &&
      [...included].every(([key, values]) => values.includes(row[key])))
    if (orderKey) {
      const key = orderKey
      rows = [...rows].sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1))
    }
    return { data: rows.slice(0, count)[0] ?? null, error: null }
  }
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.set(key, value); return query },
    in: (key: string, values: unknown[]) => { included.set(key, values); return query },
    order: (key: string, options: { ascending: boolean }) => { orderKey = key; ascending = options.ascending; return query },
    limit: (value: number) => { count = value; return query },
    insert: (input: Row) => { payload = input; return query },
    single: execute,
    maybeSingle: execute,
    then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
  }
  return query
}
const storage = {
  from: () => ({
    upload: async (path: string, bytes: Buffer) => {
      state.uploads++
      state.files.set(path, bytes)
      return { error: null }
    },
    remove: async (paths: string[]) => {
      for (const path of paths) { state.removed.push(path); state.files.delete(path) }
      return { error: null }
    },
  }),
}
const boundary = {
  createClient: async () => { state.clientCalls++; return { from, storage } },
  requireRole: async (allowed: Role[]) => {
    if (!allowed.includes(state.actor.role)) throw new Error('Access denied')
    return state.actor
  },
  enforceRateLimit: async () => {},
}

const trackingKey = '77777777-7777-4777-8777-777777777777'
const localId = '88888888-8888-4888-8888-888888888888'
function input(sessionTracking: unknown = { kind: 'webxr-session-v1', sessionKey: trackingKey, localId }, snapshotDataUrl?: string) {
  return {
    sessionId, inspectionId, label: 'Column A session marker', damageType: 'none' as const,
    pose: {
      position: { x: .5, y: 1.25, z: -2 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
      sessionTracking,
    },
    snapshotDataUrl,
  }
}
const actionUrl = new URL('../actions/ar.ts', import.meta.url)
const actionPath = fileURLToPath(actionUrl)
const requireAction = createRequire(actionUrl)
const { outputText } = ts.transpileModule(readFileSync(actionUrl, 'utf8'), {
  fileName: actionPath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
})
const actionModule = { exports: {} as {
  createARAnchor: (value: ReturnType<typeof input>) => Promise<ARAnchor>
  getActiveARSession: (id: string) => Promise<ARSession | null>
} }
const load = compileFunction(outputText, ['exports', 'require', 'module', '__filename', '__dirname'], { filename: actionPath })
load(actionModule.exports, (specifier: string) => {
  if (['@/app/lib/dal', '@/app/lib/supabase/server', '@/app/lib/rate-limit'].includes(specifier)) return boundary
  return requireAction(specifier)
}, actionModule, actionPath, dirname(actionPath))
const { createARAnchor, getActiveARSession } = actionModule.exports

beforeEach(() => {
  state.actor = { userId, role: 'inspector' }
  state.tables = {
    ar_anchors: [],
    ar_sessions: [{ id: sessionId, inspection_id: inspectionId, started_by: userId, status: 'active', started_at: '2026-11-11T08:00:00Z', device_info: { trackingSessionKey: trackingKey } }],
    inspections: [{ id: inspectionId, lead_inspector_id: userId }],
  }
  state.insertError = null
  state.inserts = 0
  state.uploads = 0
  state.clientCalls = 0
  state.removed = []
  state.files.clear()
})

async function snapshot() {
  const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'white' } }).jpeg().toBuffer()
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

function noWrite() {
  assert.equal(state.inserts, 0)
  assert.equal(state.uploads, 0)
  assert.equal(state.tables.ar_anchors.length, 0)
}

describe('session-only marker persistence', () => {
  test('a current WebXR surface hit saves its session metadata and real pose without fabricated photo evidence', async () => {
    const value = input()
    const marker = await createARAnchor(value)
    assert.deepEqual(marker.pose.position, value.pose.position)
    assert.deepEqual(marker.pose.quaternion, value.pose.quaternion)
    assert.deepEqual(marker.pose.sessionTracking, value.pose.sessionTracking)
    assert.equal(marker.snapshot_path, null)
    assert.equal(state.uploads, 0)
    assert.equal(state.tables.ar_anchors.length, 1)
  })

  test('a camera annotation requires a real image and keeps image-point metadata separate from WebXR', async () => {
    const metadata = { kind: 'camera-frame-v1', sessionKey: trackingKey, point: { x: .25, y: .75 } }
    const marker = await createARAnchor(input(metadata, await snapshot()))
    assert.deepEqual(marker.pose.sessionTracking, metadata)
    assert.ok(marker.snapshot_path)
    const stored = state.files.get(marker.snapshot_path)
    assert.ok(stored)
    assert.equal((await sharp(stored).metadata()).format, 'jpeg')
  })

  test('a camera-only annotation cannot save without image evidence', async () => {
    await assert.rejects(() => createARAnchor(input({ kind: 'camera-frame-v1', sessionKey: trackingKey, point: { x: .5, y: .5 } })))
    noWrite()
  })

  test('metadata from a previous tracking session cannot be attached to the current database session', async () => {
    const data = await snapshot()
    await assert.rejects(() => createARAnchor(input({ kind: 'webxr-session-v1', sessionKey: otherId, localId }, data)))
    noWrite()
  })

  test('a database session without the matching tracking key cannot authorize session-relative markers', async () => {
    state.tables.ar_sessions[0].device_info = {}
    await assert.rejects(() => createARAnchor(input()))
    noWrite()
  })

  test('malformed kinds, identifiers and camera image points are rejected before storage or insert', async () => {
    const data = await snapshot()
    for (const invalid of [
      { kind: 'webxr-session-v1', sessionKey: 'not-a-uuid', localId },
      { kind: 'webxr-session-v1', sessionKey: trackingKey, localId: 'not-a-uuid' },
      { kind: 'world-checkpoint-v1', sessionKey: trackingKey, localId },
      { kind: 'webxr-session-v1', sessionKey: trackingKey, localId, persistent: true },
      { kind: 'camera-frame-v1', sessionKey: trackingKey, point: { x: -.01, y: .5 } },
      { kind: 'camera-frame-v1', sessionKey: trackingKey, point: { x: .5, y: 1.01 } },
      { kind: 'camera-frame-v1', sessionKey: trackingKey, point: { x: NaN, y: .5 } },
    ]) await assert.rejects(() => createARAnchor(input(invalid, data)))
    noWrite()
  })

  test('a marker cannot mix printed-reference and session-relative coordinate frames', async () => {
    const value = input()
    const mixed = { ...value, pose: { ...value.pose, reference: {
      kind: 'printed-reference-v1',
      target: { id: localId, inspectionId, label: 'Wall', sizeMm: 150 },
      point: { x: .5, y: .5 },
    } } }
    await assert.rejects(() => createARAnchor(mixed), /coordinate|frame/i)
    noWrite()
  })

  test('session ownership remains enforced for markerless records', async () => {
    state.tables.ar_sessions[0].started_by = otherId
    await assert.rejects(() => createARAnchor(input()), /own|denied|session/i)
    noWrite()
  })

  test('an ended database session cannot accept more session-relative points', async () => {
    state.tables.ar_sessions[0].status = 'completed'
    await assert.rejects(() => createARAnchor(input()), /active|session/i)
    noWrite()
  })
})
