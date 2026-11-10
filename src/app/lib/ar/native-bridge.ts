import type {
  ARBridgeEvent,
  NativeARSessionOptions,
  ARBridgePluginInterface,
} from '@/types/ar-bridge'
import type { ARPose } from '@/app/types'

type Listener = (event: ARBridgeEvent) => void
const eventListeners: Set<Listener> = new Set()
let activeSessionId: string | null = null

type CapacitorWindow = Window & {
  Capacitor?: {
    isPluginAvailable?: (name: string) => boolean
    Plugins?: Record<string, unknown>
  }
}

interface XRSystemLike {
  isSessionSupported: (mode: string) => Promise<boolean>
}

function getCapacitorPlugin(): ARBridgePluginInterface | null {
  if (typeof window === 'undefined') return null
  const cap = (window as CapacitorWindow).Capacitor
  if (cap?.isPluginAvailable?.('CapacitorARBridge') && cap.Plugins?.CapacitorARBridge) {
    return cap.Plugins.CapacitorARBridge as ARBridgePluginInterface
  }
  return null
}

function isBridgeEvent(value: unknown): value is ARBridgeEvent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { type?: unknown; payload?: unknown }
  return typeof candidate.type === 'string' && typeof candidate.payload === 'object' && candidate.payload !== null
}

/**
 * Native AR availability. WebXR is reported only when the browser actually
 * supports an immersive-ar session — `'xr' in navigator` is true on desktops
 * with no AR hardware, which previously produced a fake plane count.
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
      return { available: res.available, platform: res.platform, engine: res.engine }
    } catch {
      return { available: false, platform: 'web', engine: 'mock' }
    }
  }

  if (typeof navigator !== 'undefined') {
    const xr = (navigator as Navigator & { xr?: XRSystemLike }).xr
    if (xr) {
      try {
        if (await xr.isSessionSupported('immersive-ar')) {
          return { available: true, platform: 'web', engine: 'WebXR' }
        }
      } catch {
        // Fall through to unavailable.
      }
    }
  }

  return { available: false, platform: 'web', engine: 'mock' }
}

/**
 * Starts a native AR session. Throws when no native plugin is present rather
 * than emitting synthetic tracking events.
 */
export async function startNativeARSession(
  inspectionId: string,
  options?: NativeARSessionOptions
): Promise<void> {
  const plugin = getCapacitorPlugin()
  if (!plugin) {
    throw new Error('Native AR is not available on this device')
  }

  const result = await plugin.startSession({
    inspectionId,
    enablePlaneDetection: options?.enablePlaneDetection ?? true,
    enableLightEstimation: options?.enableLightEstimation ?? true,
    worldAlignment: options?.worldAlignment ?? 'gravity',
  })

  if (!result?.success) {
    throw new Error('Native AR session could not start')
  }

  activeSessionId = inspectionId
}

/**
 * Requests camera permission from the native plugin. Browser sessions use
 * getUserMedia instead.
 */
export async function requestNativeCameraPermission(): Promise<boolean> {
  const plugin = getCapacitorPlugin()
  if (!plugin) return false
  const result = await plugin.requestCameraPermission()
  return result?.granted === true
}

/**
 * Places a native spatial anchor. Only the native plugin can do this; the web
 * path has no spatial anchor API and must not invent one.
 */
export async function placeNativeAnchor(
  pose: ARPose,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const plugin = getCapacitorPlugin()
  if (!plugin) {
    throw new Error('Native anchors require the AR plugin')
  }
  const res = await plugin.placeAnchor({ pose, metadata })
  return res.nativeId
}

export async function stopNativeARSession(): Promise<void> {
  const plugin = getCapacitorPlugin()
  if (plugin) {
    await plugin.stopSession()
  }
  activeSessionId = null
}

/**
 * Subscribes to the single wrapped native event channel.
 *
 * Native plugins previously emitted both `arBridgeEvent` and a top-level event
 * per type, and this module subscribed to both, delivering every event twice.
 * The contract is now exactly one channel: { type, payload }.
 */
export function onARBridgeEvent(callback: Listener): () => void {
  eventListeners.add(callback)
  const plugin = getCapacitorPlugin()

  const handles: { remove: () => void }[] = []
  let cancelled = false

  const removeHandles = () => {
    handles.forEach((handle) => {
      try {
        handle?.remove?.()
      } catch (error) {
        console.error('Failed to remove AR bridge listener:', error)
      }
    })
    handles.length = 0
  }

  if (plugin) {
    plugin
      .addListener('arBridgeEvent', (event: unknown) => {
        if (isBridgeEvent(event)) {
          callback(event)
        }
      })
      .then((handle) => {
        // If the caller unsubscribed before registration resolved, remove now.
        if (cancelled) handle?.remove?.()
        else handles.push(handle)
      })
      .catch((error) => console.error('Failed to register AR bridge listener:', error))
  }

  return () => {
    cancelled = true
    eventListeners.delete(callback)
    removeHandles()
  }
}

/**
 * Captures a native camera frame. Browser frames are captured by the session
 * manager's canvas, never by a placeholder SVG.
 */
export async function captureNativeSnapshot(): Promise<string> {
  const plugin = getCapacitorPlugin()
  if (!plugin) {
    throw new Error('Native snapshot capture requires the AR plugin')
  }
  const res = await plugin.captureSnapshot()
  return res.dataUrl
}

export function emitEvent(event: ARBridgeEvent): void {
  eventListeners.forEach((listener) => {
    try {
      listener(event)
    } catch (e) {
      console.error('Error in AR bridge listener:', e)
    }
  })
}

export function isSessionActive(): boolean {
  return activeSessionId !== null
}
