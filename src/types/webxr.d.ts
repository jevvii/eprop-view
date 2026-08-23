// Minimal WebXR type declarations for the AR Module prototype.
// These declarations are sufficient for TypeScript checking and can be
// replaced by `@types/webxr` in a production build.

declare global {
  interface XRSessionInit {
    requiredFeatures?: string[]
    optionalFeatures?: string[]
    domOverlay?: { root: Element }
  }

  interface XRSession extends EventTarget {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions): void
    requestReferenceSpace(type: 'local' | 'local-floor' | 'bounded-floor' | 'unbounded'): Promise<XRReferenceSpace>
    requestAnimationFrame(callback: XRFrameRequestCallback): number
    cancelAnimationFrame(handle: number): void
    end(): Promise<void>
  }

  interface XRReferenceSpace extends EventTarget {
    getOffsetReferenceSpace(originOffset: XRRigidTransform): XRReferenceSpace
  }

  interface XRRigidTransform {
    readonly position: DOMPointReadOnly
    readonly orientation: DOMPointReadOnly
    readonly matrix: Float32Array
    readonly inverse: XRRigidTransform
  }

  interface XRFrame {
    readonly session: XRSession
    getViewerPose(referenceSpace: XRReferenceSpace): XRViewerPose | undefined
  }

  type XRFrameRequestCallback = (time: DOMHighResTimeStamp, frame: XRFrame) => void

  interface XRViewerPose {
    readonly transform: XRRigidTransform
    readonly views: XRView[]
  }

  interface XRView {
    readonly eye: 'none' | 'left' | 'right'
    readonly projectionMatrix: Float32Array
    readonly transform: XRRigidTransform
  }

  interface XRSystem {
    isSessionSupported(mode: 'immersive-ar' | 'immersive-vr' | 'inline'): Promise<boolean>
    requestSession(mode: 'immersive-ar' | 'immersive-vr' | 'inline', options?: XRSessionInit): Promise<XRSession>
  }

  interface Navigator {
    xr?: XRSystem
  }
}

export {}
