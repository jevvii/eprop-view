import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFunction } from 'node:vm'
import ts from 'typescript'
import type { Role } from '@/app/types'

const ANCHOR_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ID = '22222222-2222-4222-8222-222222222222'
const INSPECTION_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '44444444-4444-4444-8444-444444444444'
type Row = Record<string, string | null>
type Table = 'ar_anchors' | 'ar_sessions'

// Replace request/auth/database boundaries while executing the real server action.
// The fake database preserves rows when RLS denies DELETE, just like PostgREST.
const state = {
  actor: { userId: USER_ID, role: 'inspector' as Role },
  tables: { ar_anchors: [] as Row[], ar_sessions: [] as Row[] },
  readError: null as Error | null,
  deleteError: null as Error | null,
  denyDelete: false,
  roleChecks: [] as Role[][],
  deleteAttempts: 0,
  clientCalls: 0,
}

function from(table: Table) {
  const filters = new Map<string, string>()
  let deleting = false
  let returning = false
  const execute = async () => {
    const error = deleting ? state.deleteError : state.readError
    if (error) return { data: null, error }
    const rows = state.tables[table]
    const matches = rows.filter((row) => [...filters].every(([key, value]) => row[key] === value))
    if (!deleting) return { data: matches[0] ?? null, error: null }
    state.deleteAttempts++
    if (state.denyDelete) return { data: null, error: null }
    state.tables[table] = rows.filter((row) => !matches.includes(row))
    return { data: returning ? matches[0] ?? null : null, error: null }
  }
  const query = {
    select: () => { returning = true; return query },
    eq: (key: string, value: string) => { filters.set(key, value); return query },
    delete: () => { deleting = true; returning = false; return query },
    single: execute,
    maybeSingle: execute,
    then: (resolve: (result: Awaited<ReturnType<typeof execute>>) => unknown) => execute().then(resolve),
  }
  return query
}

const mockBoundary = {
  createClient: async () => { state.clientCalls++; return { from } },
  requireRole: async (allowed: Role[]) => {
    state.roleChecks.push(allowed)
    if (!allowed.includes(state.actor.role)) throw new Error('Access denied')
    return state.actor
  },
}
// Compile the real action source in the current realm, so the test works on
// Node 20 as well as newer runtimes without global loader hooks or test flags.
const actionUrl = new URL('../actions/ar.ts', import.meta.url)
const actionPath = fileURLToPath(actionUrl)
const requireAction = createRequire(actionUrl)
const { outputText } = ts.transpileModule(readFileSync(actionUrl, 'utf8'), {
  fileName: actionPath,
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2017,
    esModuleInterop: true,
  },
})
const actionModule = { exports: {} as {
  deleteARAnchor: (id: string) => Promise<{ id: string; inspection_id: string }>
} }
const loadAction = compileFunction(outputText, ['exports', 'require', 'module', '__filename', '__dirname'], {
  filename: actionPath,
})
loadAction(actionModule.exports, (specifier: string) => {
  if (specifier === '@/app/lib/dal' || specifier === '@/app/lib/supabase/server') return mockBoundary
  // Other exports in ar.ts use rate limiting; deletion does not call this import.
  if (specifier === '@/app/lib/rate-limit') return {}
  return requireAction(specifier)
}, actionModule, actionPath, dirname(actionPath))
const { deleteARAnchor } = actionModule.exports

beforeEach(() => {
  state.actor = { userId: USER_ID, role: 'inspector' }
  state.tables.ar_anchors = [{ id: ANCHOR_ID, session_id: SESSION_ID, inspection_id: INSPECTION_ID }]
  state.tables.ar_sessions = [{ id: SESSION_ID, started_by: USER_ID, status: 'completed' }]
  state.readError = null
  state.deleteError = null
  state.denyDelete = false
  state.roleChecks = []
  state.deleteAttempts = 0
  state.clientCalls = 0
})

describe('saved AR marker deletion', () => {
  test('an inspector can delete a marker from their completed session', async () => {
    const otherId = '66666666-6666-4666-8666-666666666666'
    state.tables.ar_anchors.push({ id: otherId, session_id: SESSION_ID, inspection_id: INSPECTION_ID })
    const deleted = await deleteARAnchor(ANCHOR_ID)
    assert.equal(deleted.id, ANCHOR_ID)
    assert.equal(deleted.inspection_id, INSPECTION_ID)
    assert.deepEqual(state.tables.ar_anchors.map((row) => row.id), [otherId])
    assert.equal(state.tables.ar_sessions.length, 1)
    assert.deepEqual(state.roleChecks, [['inspector', 'admin']])
  })

  test('an inspector cannot delete another inspector\'s marker', async () => {
    state.tables.ar_sessions[0].started_by = '55555555-5555-4555-8555-555555555555'
    await assert.rejects(() => deleteARAnchor(ANCHOR_ID), /access denied|own|permission/i)
    assert.equal(state.tables.ar_anchors.length, 1)
    assert.equal(state.deleteAttempts, 0)
  })

  test('an admin can delete a marker belonging to another session owner', async () => {
    state.actor.role = 'admin'
    state.tables.ar_sessions[0].started_by = '55555555-5555-4555-8555-555555555555'
    const deleted = await deleteARAnchor(ANCHOR_ID)
    assert.equal(deleted.id, ANCHOR_ID)
    assert.equal(state.tables.ar_anchors.length, 0)
  })

  for (const role of ['engineer', 'viewer'] as const) {
    test(`${role} cannot delete saved markers`, async () => {
      state.actor.role = role
      await assert.rejects(() => deleteARAnchor(ANCHOR_ID), /access denied/i)
      assert.equal(state.tables.ar_anchors.length, 1)
      assert.equal(state.clientCalls, 0)
    })
  }

  test('invalid marker IDs are rejected before database access', async () => {
    await assert.rejects(() => deleteARAnchor('not-a-uuid'), /invalid/i)
    assert.equal(state.clientCalls, 0)
  })

  test('missing markers do not report successful deletion', async () => {
    state.tables.ar_anchors = []
    await assert.rejects(() => deleteARAnchor(ANCHOR_ID), /not found|not available|could not|unable/i)
    assert.equal(state.deleteAttempts, 0)
  })

  test('an unknown marker ID cannot delete a different existing marker', async () => {
    await assert.rejects(() => deleteARAnchor('66666666-6666-4666-8666-666666666666'))
    assert.equal(state.tables.ar_anchors[0].id, ANCHOR_ID)
    assert.equal(state.deleteAttempts, 0)
  })

  test('a missing session cannot authorize an inspector to delete a marker', async () => {
    state.tables.ar_sessions = []
    await assert.rejects(() => deleteARAnchor(ANCHOR_ID))
    assert.equal(state.tables.ar_anchors.length, 1)
    assert.equal(state.deleteAttempts, 0)
  })

  test('database read failures leave the marker untouched', async () => {
    state.readError = new Error('read failed')
    await assert.rejects(() => deleteARAnchor(ANCHOR_ID))
    assert.equal(state.tables.ar_anchors.length, 1)
    assert.equal(state.deleteAttempts, 0)
  })

  test('database delete failures reject and leave the marker intact', async () => {
    state.deleteError = new Error('delete failed')
    await assert.rejects(() => deleteARAnchor(ANCHOR_ID))
    assert.equal(state.tables.ar_anchors.length, 1)
  })

  test('an RLS-filtered deletion with no error is not treated as success', async () => {
    state.denyDelete = true
    await assert.rejects(() => deleteARAnchor(ANCHOR_ID), /delete|removed|permission/i)
    assert.equal(state.tables.ar_anchors.length, 1)
    assert.equal(state.deleteAttempts, 1)
  })
})
