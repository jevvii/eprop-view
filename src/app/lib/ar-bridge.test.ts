import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  isNativeARAvailable,
  startNativeARSession,
  placeNativeAnchor,
  stopNativeARSession,
  onARBridgeEvent,
  captureNativeSnapshot,
  isSessionActive,
} from './ar/native-bridge'
import type { ARBridgeEvent } from '@/types/ar-bridge'

describe('Phase B: Native ARKit / ARCore Bridge Tests', () => {
  test('isNativeARAvailable reports platform and engine capabilities', async () => {
    const status = await isNativeARAvailable()
    assert.ok(typeof status.available === 'boolean')
    assert.ok(['ios', 'android', 'web'].includes(status.platform))
    assert.ok(['ARKit', 'ARCore', 'WebXR', 'mock'].includes(status.engine))
  })

  test('startNativeARSession starts session and emits plane detection event', async () => {
    const receivedEvents: ARBridgeEvent[] = []
    const unsubscribe = onARBridgeEvent((event) => {
      receivedEvents.push(event)
    })

    await startNativeARSession('test_inspection_123', {
      enablePlaneDetection: true,
      worldAlignment: 'gravity',
    })

    assert.equal(isSessionActive(), true)
    assert.ok(receivedEvents.some((e) => e.type === 'planeDetected'))

    unsubscribe()
  })

  test('placeNativeAnchor emits anchorPlaced event and returns native identifier', async () => {
    const receivedEvents: ARBridgeEvent[] = []
    const unsubscribe = onARBridgeEvent((event) => {
      receivedEvents.push(event)
    })

    const pose = {
      position: { x: 0.5, y: 1.2, z: -2.0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    }

    const nativeId = await placeNativeAnchor(pose, { label: 'Rebar Spall Target' })

    assert.ok(nativeId.startsWith('native_') || nativeId.startsWith('arkit_') || nativeId.startsWith('arcore_'))
    assert.ok(receivedEvents.some((e) => e.type === 'anchorPlaced'))

    unsubscribe()
  })

  test('captureNativeSnapshot returns valid image URI payload', async () => {
    const snapshot = await captureNativeSnapshot()
    assert.ok(snapshot.startsWith('data:image/'))
  })

  test('stopNativeARSession completes session lifecycle and notifies listeners', async () => {
    const receivedEvents: ARBridgeEvent[] = []
    const unsubscribe = onARBridgeEvent((event) => {
      receivedEvents.push(event)
    })

    await stopNativeARSession()
    assert.equal(isSessionActive(), false)
    assert.ok(receivedEvents.some((e) => e.type === 'sessionEnded'))

    unsubscribe()
  })

  test('onARBridgeEvent receives and normalizes structured bridge event payloads', (t, done) => {
    const unsubscribe = onARBridgeEvent((event) => {
      assert.equal(event.type, 'planeDetected')
      assert.ok(event.payload !== undefined)
      unsubscribe()
      done()
    })

    // Simulate event delivery
    const { emitEvent } = require('./ar/native-bridge')
    emitEvent({
      type: 'planeDetected',
      payload: { id: 'plane_mock_99', alignment: 'horizontal' },
    })
  })
})
