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
const targetId = '55555555-5555-4555-8555-555555555555'
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

function input(snapshotDataUrl?: string) {
  return {
    sessionId, inspectionId, label: 'Column A defect', damageType: 'none' as const,
    pose: {
      position: { x: 999, y: 999, z: -1.45 },
      quaternion: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 },
      reference: {
        kind: 'printed-reference-v1' as const,
        target: { id: targetId, inspectionId, label: 'Column A', sizeMm: 150 },
        point: { x: 0.25, y: 0.75 },
      },
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
    ar_sessions: [{ id: sessionId, inspection_id: inspectionId, started_by: userId, status: 'active', started_at: '2026-11-11T08:00:00Z' }],
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

describe('printed-reference marker server actions', () => {
  test('a valid marker uses server-derived reference coordinates and identity rotation', async () => {
    const marker = await createARAnchor(input())
    assert.ok(Math.abs(marker.pose.position.x - 0.0375) < 1e-12)
    assert.ok(Math.abs(marker.pose.position.y + 0.1125) < 1e-12)
    assert.equal(marker.pose.position.z, 0)
    assert.deepEqual(marker.pose.quaternion, { x: 0, y: 0, z: 0, w: 1 })
    assert.equal(marker.pose.reference?.target.id, targetId)
    assert.equal(marker.inspection_id, inspectionId)
    assert.equal(state.tables.ar_anchors.length, 1)
  })

  test('foreign-inspection QR metadata is rejected before database or storage access', async () => {
    const value = input()
    value.pose.reference.target.inspectionId = otherId
    await assert.rejects(() => createARAnchor(value), /inspection/i)
    assert.equal(state.clientCalls, 0)
    noWrite()
  })

  test('malformed reference identity and out-of-range or non-finite points are rejected', async () => {
    const malformed = input()
    malformed.pose.reference.target.id = 'not-a-uuid'
    await assert.rejects(() => createARAnchor(malformed))
    for (const x of [11, Number.NaN, Infinity]) {
      const value = input()
      value.pose.reference.point.x = x
      await assert.rejects(() => createARAnchor(value))
    }
    assert.equal(state.clientCalls, 0)
    noWrite()
  })

  test('a session from another inspection cannot receive this inspection\'s marker', async () => {
    state.tables.ar_sessions[0].inspection_id = otherId
    const dataUrl = await snapshot()
    await assert.rejects(() => createARAnchor(input(dataUrl)))
    noWrite()
  })

  test('an inspector cannot insert a marker in another inspector\'s active session', async () => {
    state.tables.ar_sessions[0].started_by = otherId
    const dataUrl = await snapshot()
    await assert.rejects(() => createARAnchor(input(dataUrl)), /session|access denied|own/i)
    noWrite()
  })

  test('completed and paused sessions cannot accept new markers', async () => {
    const dataUrl = await snapshot()
    for (const status of ['completed', 'paused']) {
      state.tables.ar_sessions[0].status = status
      await assert.rejects(() => createARAnchor(input(dataUrl)), /session|active/i)
      noWrite()
    }
  })

  test('a missing session cannot accept a marker or an evidence upload', async () => {
    state.tables.ar_sessions = []
    const dataUrl = await snapshot()
    await assert.rejects(() => createARAnchor(input(dataUrl)))
    noWrite()
  })

  test('an admin can place a marker in another owner\'s active session', async () => {
    state.actor.role = 'admin'
    state.tables.ar_sessions[0].started_by = otherId
    const marker = await createARAnchor(input())
    assert.equal(marker.session_id, sessionId)
    assert.equal(state.tables.ar_anchors.length, 1)
  })

  test('an admin still cannot attach a marker to a different inspection\'s session', async () => {
    state.actor.role = 'admin'
    state.tables.ar_sessions[0].inspection_id = otherId
    const dataUrl = await snapshot()
    await assert.rejects(() => createARAnchor(input(dataUrl)))
    noWrite()
  })

  test('inspection assignment remains enforced in addition to session ownership', async () => {
    state.tables.inspections[0].lead_inspector_id = otherId
    const dataUrl = await snapshot()
    await assert.rejects(() => createARAnchor(input(dataUrl)), /access denied|own/i)
    noWrite()
  })

  test('reviewer and viewer roles cannot create printed-reference markers', async () => {
    for (const role of ['engineer', 'viewer'] as const) {
      state.actor.role = role
      await assert.rejects(() => createARAnchor(input()), /access denied/i)
      noWrite()
    }
    assert.equal(state.clientCalls, 0)
  })

  test('a successful marker keeps its real JPEG snapshot in inspection-owned storage', async () => {
    const marker = await createARAnchor(input(await snapshot()))
    assert.ok(marker.snapshot_path)
    assert.ok(marker.snapshot_path.startsWith(`${inspectionId}/${userId}/ar-`))
    const stored = state.files.get(marker.snapshot_path)
    assert.ok(stored)
    assert.equal((await sharp(stored).metadata()).format, 'jpeg')
    assert.equal(state.removed.length, 0)
    assert.equal(state.files.size, 1)
  })

  test('a newly uploaded snapshot is cleaned up if the marker insert fails', async () => {
    state.insertError = new Error('insert failed')
    const dataUrl = await snapshot()
    await assert.rejects(() => createARAnchor(input(dataUrl)))
    assert.equal(state.uploads, 1)
    assert.equal(state.files.size, 0)
    assert.equal(state.removed.length, 1)
    assert.equal(state.tables.ar_anchors.length, 0)
  })

  test('session reattachment finds only the current actor\'s active session', async () => {
    state.tables.ar_sessions.push({ id: otherId, inspection_id: inspectionId, started_by: otherId, status: 'active', started_at: '2026-11-11T10:00:00Z' })
    const session = await getActiveARSession(inspectionId)
    assert.equal(session?.id, sessionId)
    assert.equal(session?.started_by, userId)
  })

  test('another inspector\'s active session is never reattached when the actor has none', async () => {
    state.tables.ar_sessions[0].started_by = otherId
    assert.equal(await getActiveARSession(inspectionId), null)
  })

  test('a paused session is not reused as an active placement session', async () => {
    state.tables.ar_sessions[0].status = 'paused'
    assert.equal(await getActiveARSession(inspectionId), null)
  })
})
