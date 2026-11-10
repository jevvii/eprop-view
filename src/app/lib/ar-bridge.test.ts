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
  emitEvent,
} from './ar/native-bridge'

/**
 * These tests run in Node with no Capacitor plugin and no DOM. The contract is
 * that a missing native capability reports unavailable and rejects; it must
 * never invent planes, anchors or snapshot images.
 */
describe('Phase B: Native ARKit / ARCore bridge contract', () => {
  test('isNativeARAvailable reports unavailable in a non-native environment', async () => {
    const status = await isNativeARAvailable()
    assert.equal(status.available, false)
    assert.equal(status.platform, 'web')
    assert.equal(status.engine, 'mock')
  })

  test('startNativeARSession rejects without a native plugin', async () => {
    await assert.rejects(() => startNativeARSession('test_inspection_123'), /not available/i)
    assert.equal(isSessionActive(), false)
  })

  test('placeNativeAnchor rejects without a native plugin', async () => {
    const pose = {
      position: { x: 0.5, y: 1.2, z: -2.0 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    }

    await assert.rejects(
      () => placeNativeAnchor(pose, { label: 'Rebar Spall Target' }),
      /require the AR plugin/i
    )
  })

  test('captureNativeSnapshot rejects instead of returning a placeholder image', async () => {
    await assert.rejects(() => captureNativeSnapshot(), /requires? the AR plugin/i)
  })

  test('stopNativeARSession is a safe no-op without a native plugin', async () => {
    await stopNativeARSession()
    assert.equal(isSessionActive(), false)
  })

  test('onARBridgeEvent delivers structured events and unsubscribes cleanly', () => {
    const received: string[] = []
    const unsubscribe = onARBridgeEvent((event) => {
      received.push(event.type)
    })

    emitEvent({
      type: 'planeDetected',
      payload: { id: 'plane_real_1', alignment: 'horizontal' },
    })

    unsubscribe()

    emitEvent({
      type: 'sessionEnded',
      payload: {},
    })

    assert.deepEqual(received, ['planeDetected'])
  })
})
