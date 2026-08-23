// Comprehensive WebXR type declarations for the EPROPVIEW AR Module prototype.

declare global {
  interface XRSessionInit {
    requiredFeatures?: string[]
    optionalFeatures?: string[]
    domOverlay?: { root: Element }
  }

  interface XRRenderStateInit {
    baseLayer?: XRWebGLLayer
    depthFar?: number
    depthNear?: number
    inlineVerticalFieldOfView?: number
  }

  interface XRRenderState {
    readonly baseLayer?: XRWebGLLayer
    readonly depthFar: number
    readonly depthNear: number
    readonly inlineVerticalFieldOfView?: number
  }

  interface XRHitTestOptionsInit {
    space: XRSpace
    entityTypes?: ('point' | 'plane' | 'mesh')[]
    offsetRay?: any
  }

  interface XRHitTestSource {
    cancel(): void
  }

  interface XRHitTestResult {
    getPose(baseSpace: XRSpace): XRPose | undefined
    createAnchor?(pose?: XRRigidTransform): Promise<XRAnchor>
  }

  interface XRAnchor {
    readonly anchorSpace: XRSpace
    delete(): void
  }

  interface XRPose {
    readonly transform: XRRigidTransform
    readonly emulatedPosition: boolean
  }

  interface XRSpace extends EventTarget {}

  interface XRReferenceSpace extends XRSpace {
    getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void
  }

  interface XRRigidTransform {
    readonly position: DOMPointReadOnly
    readonly orientation: DOMPointReadOnly
    readonly matrix: Float32Array
    readonly inverse: XRRigidTransform
  }

  interface XRViewport {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }

  interface XRWebGLLayerInit {
    antialias?: boolean
    depth?: boolean
    stencil?: boolean
    alpha?: boolean
    ignoreDepthValues?: boolean
    framebufferScaleFactor?: number
  }

  interface XRWebGLLayer {
    readonly antialias: boolean
    readonly ignoreDepthValues: boolean
    readonly framebuffer: WebGLFramebuffer | null
    readonly framebufferWidth: number
    readonly framebufferHeight: number
    getViewport(view: XRView): XRViewport
  }

  const XRWebGLLayer: {
    prototype: XRWebGLLayer
    new (session: XRSession, context: WebGLRenderingContext | WebGL2RenderingContext, options?: XRWebGLLayerInit): XRWebGLLayer
    getNativeFramebufferScaleFactor(session: XRSession): number
  }

  interface XRFrame {
    readonly session: XRSession
    getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | undefined
    getHitTestResults(hitTestSource: XRHitTestSource): XRHitTestResult[]
  }

  type XRFrameRequestCallback = (time: DOMHighResTimeStamp, frame: XRFrame) => void

  interface XRViewerPose extends XRPose {
    readonly views: XRView[]
  }

  interface XRView {
    readonly eye: 'none' | 'left' | 'right'
    readonly projectionMatrix: Float32Array
    readonly transform: XRRigidTransform
    readonly recommendedViewportScale?: number
  }

  interface XRSession extends EventTarget {
    readonly renderState: XRRenderState
    updateRenderState(newState?: XRRenderStateInit): Promise<void>
    requestReferenceSpace(type: 'viewer' | 'local' | 'local-floor' | 'bounded-floor' | 'unbounded'): Promise<XRReferenceSpace>
    requestHitTestSource?(options: XRHitTestOptionsInit): Promise<XRHitTestSource>
    requestAnimationFrame(callback: XRFrameRequestCallback): number
    cancelAnimationFrame(handle: number): void
    end(): Promise<void>
  }

  interface XRSystem {
    isSessionSupported(mode: 'immersive-ar' | 'immersive-vr' | 'inline'): Promise<boolean>
    requestSession(mode: 'immersive-ar' | 'immersive-vr' | 'inline', options?: XRSessionInit): Promise<XRSession>
  }

  interface WebGLRenderingContextBase {
    makeXRCompatible?(): Promise<void>
  }

  interface Navigator {
    xr?: XRSystem
  }
}

export {}
