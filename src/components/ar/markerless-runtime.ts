import type { ARPose } from '@/app/types'
import { isCurrentXRMarker, projectXRPoint } from '@/app/lib/ar/markerless'

export interface XRInspectionState {
  active: boolean
  sessionKey: string | null
  tracking: boolean
  hit: boolean
  pins: Record<string, { x: number; y: number; distance: number }>
  message: string | null
}
interface Placement { pose: ARPose; anchor: XRAnchor | null }
interface CaptureRequest { resolve: (pose: ARPose) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; cancelled: boolean }

/** Session-owned WebXR resources. Saved database coordinates never restore a new origin. */
export class MarkerlessRuntime {
  private session: XRSession | null = null
  private space: XRReferenceSpace | null = null
  private source: XRHitTestSource | null = null
  private gl: WebGLRenderingContext | null = null
  private frameId: number | null = null
  private generation = 0
  private placements = new Map<string, Placement>()
  private registered = new Map<string, string>()
  private captureRequest: CaptureRequest | null = null
  private pendingCaptures = new Set<CaptureRequest>()
  private watchdog: ReturnType<typeof setTimeout> | null = null
  private lastPublish = 0
  private state: XRInspectionState = { active: false, sessionKey: null, tracking: false, hit: false, pins: {}, message: null }

  constructor(private publish: (state: XRInspectionState) => void, private ended: () => void) {}

  async start(overlay: HTMLElement): Promise<string> {
    if (this.session) throw new Error('An AR session is already active')
    const generation = ++this.generation
    if (!navigator.xr) throw new Error('Immersive WebXR is unavailable. Use camera/photo inspection.')
    // This call must stay before all awaited work so the Start gesture is preserved.
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'dom-overlay'], optionalFeatures: ['anchors'], domOverlay: { root: overlay },
    })
    if (generation !== this.generation) { await session.end(); throw new Error('AR start was cancelled') }
    this.session = session
    session.addEventListener('end', this.onEnd)
    session.addEventListener('visibilitychange', this.onVisibility)
    try {
      const canvas = document.createElement('canvas') // never reuse the camera capture canvas
      const gl = canvas.getContext('webgl', { alpha: true, antialias: true })
      if (!gl) throw new Error('WebGL is unavailable for AR')
      this.gl = gl
      await gl.makeXRCompatible?.()
      if (generation !== this.generation) throw new Error('AR start was cancelled')
      session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) })
      this.space = await session.requestReferenceSpace('local')
      this.space.addEventListener('reset', this.onReset)
      const viewer = await session.requestReferenceSpace('viewer')
      if (!session.requestHitTestSource) throw new Error('This browser does not provide AR surface hit testing')
      this.source = await session.requestHitTestSource({ space: viewer })
      if (generation !== this.generation) throw new Error('AR start was cancelled')
      const key = crypto.randomUUID()
      this.setState({ active: true, sessionKey: key, tracking: false, hit: false, pins: {}, message: 'Move the phone slowly to find a surface.' })
      this.frameId = session.requestAnimationFrame(this.onFrame)
      this.watchdog = setTimeout(() => {
        if (!this.state.tracking && this.session === session) this.setState({ ...this.state, message: 'No tracked camera pose yet. Move slowly in a well-lit area, or end AR and use camera/photo inspection.' })
      }, 6000)
      return key
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  private setState(state: XRInspectionState) { this.state = state; this.publish(state) }
  private onVisibility = () => {
    if (this.session?.visibilityState !== 'visible') this.setState({ ...this.state, tracking: false, hit: false, pins: {}, message: 'Tracking paused. Return to the AR view.' })
  }
  private onReset = () => {
    // Saved local coordinates cannot be carried into a changed physical origin.
    void this.stop().finally(() => this.ended())
  }
  private onEnd = () => { this.cleanup(); this.ended() }

  private onFrame: XRFrameRequestCallback = (time, frame) => {
    const session = this.session, space = this.space, gl = this.gl
    if (!session || !space || !gl || frame.session !== session) return
    this.frameId = session.requestAnimationFrame(this.onFrame)
    const layer = session.renderState.baseLayer
    if (layer) { gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT) }
    const viewer = session.visibilityState && session.visibilityState !== 'visible' ? null : frame.getViewerPose(space)
    const view = viewer?.views[0]
    const hit = view && this.source ? frame.getHitTestResults(this.source)[0] : undefined
    const hitPose = hit?.getPose(space)
    const request = this.captureRequest
    if (request) {
      this.captureRequest = null
      if (!view || !hit || !hitPose || !this.state.sessionKey) {
        clearTimeout(request.timer)
        this.pendingCaptures.delete(request)
        request.reject(new Error('No tracked surface at the centre reticle. Move the camera and try again.'))
      } else {
        const localId = crypto.randomUUID(), key = this.state.sessionKey, generation = this.generation
        const pose: ARPose = { position: { x: hitPose.transform.position.x, y: hitPose.transform.position.y, z: hitPose.transform.position.z },
          quaternion: { x: hitPose.transform.orientation.x, y: hitPose.transform.orientation.y, z: hitPose.transform.orientation.z, w: hitPose.transform.orientation.w },
          sessionTracking: { kind: 'webxr-session-v1', sessionKey: key, localId } }
        // Invoke inside the XR frame; its native frame is invalid after this callback.
        let anchorPromise: Promise<XRAnchor | null>
        try { anchorPromise = hit.createAnchor ? hit.createAnchor().catch(() => null) : Promise.resolve(null) } catch { anchorPromise = Promise.resolve(null) }
        void anchorPromise.then((anchor) => {
          clearTimeout(request.timer)
          this.pendingCaptures.delete(request)
          if (request.cancelled || generation !== this.generation || key !== this.state.sessionKey) { anchor?.delete(); request.reject(new Error('The AR session ended before placement completed')); return }
          this.placements.set(localId, { pose, anchor })
          request.resolve(pose)
        })
      }
    }
    const pins: XRInspectionState['pins'] = {}
    if (view && this.state.sessionKey) {
      for (const [id, localId] of this.registered) {
        const placed = this.placements.get(localId)
        if (!placed || !isCurrentXRMarker(placed.pose, this.state.sessionKey)) continue
        const trackedPose = placed.anchor ? frame.getPose(placed.anchor.anchorSpace, space) : null
        if (placed.anchor && !trackedPose) continue
        const position = trackedPose?.transform.position ?? placed.pose.position
        const projected = projectXRPoint(position, view.transform.inverse.matrix, view.projectionMatrix)
        if (projected) pins[id] = projected
      }
    }
    const tracking = !!view, hasHit = !!hitPose
    if (time - this.lastPublish > 40 || tracking !== this.state.tracking || hasHit !== this.state.hit) {
      this.lastPublish = time
      this.setState({ ...this.state, tracking, hit: hasHit, pins,
        message: !tracking ? 'Tracking lost. Move slowly to recover.' : !hasHit ? 'Aim the centre reticle at a textured surface.' : null })
    }
  }

  capture(): Promise<ARPose> {
    if (!this.session || !this.state.tracking) return Promise.reject(new Error('Start AR and find a tracked surface first'))
    if (this.pendingCaptures.size) return Promise.reject(new Error('A marker is already being placed'))
    return new Promise((resolve, reject) => {
      const request: CaptureRequest = { resolve, reject, cancelled: false, timer: setTimeout(() => {
        if (this.captureRequest === request) this.captureRequest = null
        request.cancelled = true
        this.pendingCaptures.delete(request)
        reject(new Error('AR placement timed out. Try again.'))
      }, 5000) }
      this.captureRequest = request
      this.pendingCaptures.add(request)
    })
  }
  register(id: string, pose: ARPose) {
    if (pose.sessionTracking?.kind === 'webxr-session-v1' && isCurrentXRMarker(pose, this.state.sessionKey ?? '')) this.registered.set(id, pose.sessionTracking.localId)
  }
  discard(pose: ARPose) {
    if (pose.sessionTracking?.kind !== 'webxr-session-v1') return
    const id = pose.sessionTracking.localId
    this.placements.get(id)?.anchor?.delete()
    this.placements.delete(id)
    for (const [markerId, localId] of this.registered) if (localId === id) this.registered.delete(markerId)
  }
  private clearPlacements() {
    this.placements.forEach(({ anchor }) => anchor?.delete())
    this.placements.clear(); this.registered.clear()
    for (const request of this.pendingCaptures) {
      clearTimeout(request.timer); request.cancelled = true; request.reject(new Error('AR tracking session ended'))
    }
    this.pendingCaptures.clear(); this.captureRequest = null
  }
  private cleanup() {
    this.generation++
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
    if (this.frameId !== null) this.session?.cancelAnimationFrame(this.frameId)
    this.frameId = null
    this.source?.cancel(); this.source = null
    this.space?.removeEventListener('reset', this.onReset); this.space = null
    this.session?.removeEventListener('end', this.onEnd)
    this.session?.removeEventListener('visibilitychange', this.onVisibility)
    this.session = null
    this.clearPlacements()
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); this.gl = null
    this.setState({ active: false, sessionKey: null, tracking: false, hit: false, pins: {}, message: null })
  }
  async stop() { const session = this.session; this.cleanup(); if (session) await session.end().catch(() => {}) }
}
