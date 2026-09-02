import type {
  ARBridgeEvent,
  NativeARSessionOptions,
  ARBridgePluginInterface,
} from '@/types/ar-bridge'
import type { ARPose } from '@/app/types'

type Listener = (event: ARBridgeEvent) => void
const eventListeners: Set<Listener> = new Set()
let activeSessionId: string | null = null

/**
 * Retrieves the Capacitor ARBridge plugin instance if available on the window object.
 */
function getCapacitorPlugin(): ARBridgePluginInterface | null {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor
  if (cap?.isPluginAvailable?.('CapacitorARBridge')) {
    return cap.Plugins.CapacitorARBridge as ARBridgePluginInterface
  }
  return null
}

/**
 * Checks whether native ARKit/ARCore is supported on the current device.
 */
export async function isNativeARAvailable(): Promise<{
  available: boolean
  platform: 'ios' | 'android' | 'web'
  engine: 'ARKit' | 'ARCore' | 'WebXR' | 'mock'
}> {
  const plugin = getCapacitorPlugin()
  if (plugin) {
    try {
      const res = await plugin.isAvailable()
      return {
        available: res.available,
        platform: res.platform,
        engine: res.engine,
      }
    } catch {
      // Ignore plugin error and fallback
    }
  }

  // Running in standard browser
  if (typeof navigator !== 'undefined' && 'xr' in navigator) {
    return { available: true, platform: 'web', engine: 'WebXR' }
  }

  return { available: false, platform: 'web', engine: 'mock' }
}

/**
 * Starts a native AR session for the specified inspection ID.
 */
export async function startNativeARSession(
  inspectionId: string,
  options?: NativeARSessionOptions
): Promise<void> {
  const plugin = getCapacitorPlugin()
  if (plugin) {
    await plugin.startSession({
      inspectionId,
      enablePlaneDetection: options?.enablePlaneDetection ?? true,
      enableLightEstimation: options?.enableLightEstimation ?? true,
      worldAlignment: options?.worldAlignment ?? 'gravity',
    })
    activeSessionId = inspectionId
    return
  }

  // Web / Emulated fallback
  activeSessionId = inspectionId
  emitEvent({
    type: 'planeDetected',
    payload: {
      id: 'mock_plane_1',
      alignment: 'horizontal',
      extentWidth: 2.5,
      extentHeight: 2.0,
    },
  })
}

/**
 * Places a native spatial anchor at the given 6-DOF pose.
 */
export async function placeNativeAnchor(
  pose: ARPose,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const plugin = getCapacitorPlugin()
  if (plugin) {
    const res = await plugin.placeAnchor({ pose, metadata })
    return res.nativeId
  }

  const generatedId = `native_${Math.random().toString(36).slice(2, 10)}`
  emitEvent({
    type: 'anchorPlaced',
    payload: {
      nativeId: generatedId,
      pose,
      metadata,
    },
  })

  return generatedId
}

/**
 * Stops the active native AR session.
 */
export async function stopNativeARSession(): Promise<void> {
  const plugin = getCapacitorPlugin()
  if (plugin) {
    await plugin.stopSession()
  }

  activeSessionId = null
  emitEvent({
    type: 'sessionEnded',
    payload: {},
  })
}

/**
 * Subscribes to AR bridge events (plane detection, anchor tracking, session lifecycle).
 * Returns an unsubscribe callback.
 */
export function onARBridgeEvent(callback: (event: ARBridgeEvent) => void): () => void {
  eventListeners.add(callback)
  const plugin = getCapacitorPlugin()

  const handles: { remove: () => void }[] = []
  if (plugin) {
    // 1. Listen for wrapped 'arBridgeEvent'
    plugin
      .addListener('arBridgeEvent', (evt: any) => {
        if (evt && evt.type) {
          callback(evt as ARBridgeEvent)
        }
      })
      .then((handle) => {
        handles.push(handle)
      })

    // 2. Also listen for individual top-level native events and normalize them into ARBridgeEvent shape
    const topLevelEvents: ARBridgeEvent['type'][] = [
      'planeDetected',
      'anchorPlaced',
      'trackingChanged',
      'sessionEnded',
    ]

    for (const evtType of topLevelEvents) {
      plugin
        .addListener(evtType, (payload: any) => {
          // If already wrapped as { type, payload }
          if (payload && payload.type && payload.payload) {
            callback(payload as ARBridgeEvent)
          } else {
            callback({ type: evtType, payload: payload || {} } as ARBridgeEvent)
          }
        })
        .then((handle) => {
          handles.push(handle)
        })
    }
  }

  return () => {
    eventListeners.delete(callback)
    handles.forEach((h) => h?.remove?.())
  }
}

/**
 * Captures a high-resolution camera frame with spatial anchor overlays.
 */
export async function captureNativeSnapshot(): Promise<string> {
  const plugin = getCapacitorPlugin()
  if (plugin) {
    const res = await plugin.captureSnapshot()
    return res.dataUrl
  }

  // Canvas / Web fallback snapshot
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="%230f172a"/><text x="50%" y="50%" fill="white" font-family="sans-serif" font-size="14" text-anchor="middle">AR SNAPSHOT CAPTURED</text></svg>'
}

/**
 * Dispatches an event to all active JS listeners.
 */
export function emitEvent(event: ARBridgeEvent): void {
  eventListeners.forEach((listener) => {
    try {
      listener(event)
    } catch (e) {
      console.error('Error in AR bridge listener:', e)
    }
  })
}

/**
 * Returns whether an AR session is currently active.
 */
export function isSessionActive(): boolean {
  return activeSessionId !== null
}
