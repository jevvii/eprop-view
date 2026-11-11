import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { isCurrentXRMarker, projectXRPoint, sessionTrackingSchema } from './ar/markerless'
import type { ARPose } from '@/app/types'

const key = '11111111-1111-4111-8111-111111111111'
const localId = '22222222-2222-4222-8222-222222222222'
const otherKey = '33333333-3333-4333-8333-333333333333'
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
// Independent OpenGL perspective: 90° vertical FOV, aspect 1, near .1, far 100.
const perspective = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -100.1 / 99.9, -1, 0, 0, -.2 * 100 / 99.9, 0]
const pose = (): ARPose => ({ position: { x: 0, y: 0, z: -2 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
  sessionTracking: { kind: 'webxr-session-v1', sessionKey: key, localId } })
const near = (value: number, expected: number) => assert.ok(Math.abs(value - expected) < 1e-7, `${value} != ${expected}`)

describe('markerless current-session projection', () => {
  test('camera-forward centre projects to the centre without assuming fixed depth', () => {
    for (const depth of [1, 2, 8]) {
      const p = projectXRPoint({ x: 0, y: 0, z: -depth }, identity, perspective)
      assert.ok(p); near(p.x, .5); near(p.y, .5); near(p.distance, depth)
    }
  })

  test('a world point responds to the actual perspective matrix', () => {
    const p = projectXRPoint({ x: 1, y: .5, z: -2 }, identity, perspective)
    assert.ok(p); near(p.x, .75); near(p.y, .375); near(p.distance, Math.sqrt(5.25))
  })

  test('camera translation changes screen position while world coordinates remain fixed', () => {
    const shiftedCamera = [...identity]; shiftedCamera[12] = -1
    const p = projectXRPoint({ x: 1, y: 0, z: -2 }, shiftedCamera, perspective)
    assert.ok(p); near(p.x, .5); near(p.y, .5); near(p.distance, 2)
  })

  test('camera rotation is applied before perspective division', () => {
    // World-to-camera rotation: a point two metres along world -X becomes camera -Z.
    const rotatedCamera = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1]
    const p = projectXRPoint({ x: -2, y: 0, z: 0 }, rotatedCamera, perspective)
    assert.ok(p); near(p.x, .5); near(p.y, .5); near(p.distance, 2)
  })

  test('non-square view projection uses the supplied horizontal focal length', () => {
    const wide = [...perspective]; wide[0] = .5
    const p = projectXRPoint({ x: 1, y: 0, z: -2 }, identity, wide)
    assert.ok(p); near(p.x, .625)
  })

  test('behind-camera, offscreen and near/far clipped points are hidden', () => {
    for (const point of [{ x: 0, y: 0, z: 2 }, { x: 3, y: 0, z: -1 }, { x: 0, y: 3, z: -1 },
      { x: 0, y: 0, z: -.01 }, { x: 0, y: 0, z: -101 }, { x: 0, y: 0, z: 0 }]) {
      assert.equal(projectXRPoint(point, identity, perspective), null)
    }
  })

  test('invalid matrices and coordinates never produce a visible marker', () => {
    const broken = [...identity]; broken[0] = NaN
    assert.equal(projectXRPoint({ x: NaN, y: 0, z: -2 }, identity, perspective), null)
    assert.equal(projectXRPoint({ x: 0, y: Infinity, z: -2 }, identity, perspective), null)
    assert.equal(projectXRPoint({ x: 0, y: 0, z: -2 }, broken, perspective), null)
    assert.equal(projectXRPoint({ x: 0, y: 0, z: -2 }, identity.slice(0, 8), perspective), null)
  })
})

describe('session-only marker contract', () => {
  test('only valid WebXR metadata from the current session can be spatially displayed', () => {
    assert.equal(isCurrentXRMarker(pose(), key), true)
    assert.equal(isCurrentXRMarker(pose(), otherKey), false)
    const legacy: ARPose = { position: { x: 0, y: 0, z: -2 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }
    assert.equal(isCurrentXRMarker(legacy, key), false)
    assert.equal(isCurrentXRMarker({ ...legacy, sessionTracking: { kind: 'camera-frame-v1', sessionKey: key, point: { x: .5, y: .5 } } }, key), false)
    assert.equal(isCurrentXRMarker({ ...legacy, reference: { kind: 'printed-reference-v1', target: { id: localId, inspectionId: key, label: 'Wall', sizeMm: 150 }, point: { x: .5, y: .5 } } }, key), false)
  })

  test('runtime filtering rejects malformed metadata even when the session key matches', () => {
    const malformed = { ...pose(), sessionTracking: { kind: 'webxr-session-v1', sessionKey: key, localId: 'invalid' } }
    assert.equal(isCurrentXRMarker(malformed as ARPose, key), false)
  })

  test('camera annotations and WebXR points have distinct, strict metadata shapes', () => {
    assert.ok(sessionTrackingSchema.safeParse({ kind: 'webxr-session-v1', sessionKey: key, localId }).success)
    assert.ok(sessionTrackingSchema.safeParse({ kind: 'camera-frame-v1', sessionKey: key, point: { x: 0, y: 1 } }).success)
    for (const invalid of [
      { kind: 'webxr-session-v1', sessionKey: 'invalid', localId },
      { kind: 'webxr-session-v1', sessionKey: key },
      { kind: 'persistent-world-v1', sessionKey: key, localId },
      { kind: 'camera-frame-v1', sessionKey: key, point: { x: -0.1, y: .5 } },
      { kind: 'camera-frame-v1', sessionKey: key, point: { x: .5, y: 1.1 } },
      { kind: 'camera-frame-v1', sessionKey: key, point: { x: NaN, y: .5 } },
      { kind: 'webxr-session-v1', sessionKey: key, localId, persistent: true },
    ]) assert.equal(sessionTrackingSchema.safeParse(invalid).success, false)
  })
})
