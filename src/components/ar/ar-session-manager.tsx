'use client'

import { useEffect, useState, useRef, useCallback, createContext, useContext, type ReactNode } from 'react'
import type { ARPose } from '@/app/types'

export interface XRSessionState {
  supported: boolean | null
  session: XRSession | null
  error: string | null
  hitPose: ARPose | null
  hitMatrix: number[] | null
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  startSession: () => Promise<void>
  endSession: () => Promise<void>
  captureCurrentFrame: () => string | null
}

const ARSessionContext = createContext<XRSessionState | undefined>(undefined)

export function useARSessionContext() {
  const ctx = useContext(ARSessionContext)
  if (!ctx) throw new Error('useARSessionContext must be used inside ARSessionManager')
  return ctx
}

interface ARSessionManagerProps {
  children: ReactNode
  onStarted?: () => void
  onEnded?: () => void
}

export function ARSessionManager({ children, onStarted, onEnded }: ARSessionManagerProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [session, setSession] = useState<XRSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hitPose, setHitPose] = useState<ARPose | null>(null)
  const [hitMatrix, setHitMatrix] = useState<number[] | null>(null)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const refSpaceRef = useRef<XRReferenceSpace | null>(null)
  const animFrameIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const xr = navigator.xr
    if (!xr) {
      setSupported(false)
      return
    }

    xr.isSessionSupported('immersive-ar')
      .then((ok) => setSupported(ok))
      .catch(() => setSupported(false))
  }, [])

  const captureCurrentFrame = useCallback((): string | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    try {
      return canvas.toDataURL('image/jpeg', 0.85)
    } catch {
      return null
    }
  }, [])

  const handleSessionEnd = useCallback(() => {
    if (animFrameIdRef.current && session) {
      try {
        session.cancelAnimationFrame(animFrameIdRef.current)
      } catch {}
      animFrameIdRef.current = null
    }

    if (hitTestSourceRef.current) {
      try {
        hitTestSourceRef.current.cancel()
      } catch {}
      hitTestSourceRef.current = null
    }

    refSpaceRef.current = null
    setSession(null)
    setHitPose(null)
    setHitMatrix(null)
    onEnded?.()
  }, [session, onEnded])

  const startSession = async () => {
    setError(null)
    if (!navigator.xr) {
      setError('WebXR Device API is not available on this platform.')
      return
    }

    try {
      const canvas = canvasRef.current
      if (!canvas) {
        throw new Error('AR canvas is not mounted. Ensure ARCameraView is rendered before starting the session.')
      }

      // Initialize WebGL context with XR compatibility
      let gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      }) as WebGLRenderingContext | null

      if (!gl) {
        throw new Error('WebGL rendering context could not be initialized.')
      }

      if (gl.makeXRCompatible) {
        await gl.makeXRCompatible()
      }
      glRef.current = gl

      const xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'local-floor'],
        domOverlay: typeof document !== 'undefined' ? { root: document.body } : undefined,
      } as XRSessionInit)

      const baseLayer = new XRWebGLLayer(xrSession, gl)
      await xrSession.updateRenderState({ baseLayer })

      // Try local-floor first, fallback to local reference space
      let refSpace: XRReferenceSpace
      try {
        refSpace = await xrSession.requestReferenceSpace('local-floor')
      } catch {
        refSpace = await xrSession.requestReferenceSpace('local')
      }
      refSpaceRef.current = refSpace

      // Request hit test source relative to viewer space
      if (xrSession.requestHitTestSource) {
        try {
          const viewerSpace = await xrSession.requestReferenceSpace('viewer')
          const hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace })
          hitTestSourceRef.current = hitTestSource
        } catch (e) {
          console.warn('Hit test source request failed:', e)
        }
      }

      xrSession.addEventListener('end', handleSessionEnd)

      // Start WebXR Render Loop
      const onXRFrame: XRFrameRequestCallback = (_time, frame) => {
        const currentSession = frame.session
        animFrameIdRef.current = currentSession.requestAnimationFrame(onXRFrame)

        const currentGL = glRef.current
        const currentLayer = currentSession.renderState.baseLayer

        if (currentGL && currentLayer) {
          currentGL.bindFramebuffer(currentGL.FRAMEBUFFER, currentLayer.framebuffer)
          currentGL.clearColor(0, 0, 0, 0)
          currentGL.clear(currentGL.COLOR_BUFFER_BIT | currentGL.DEPTH_BUFFER_BIT)
        }

        // Process Hit-Testing
        const currentHitSource = hitTestSourceRef.current
        const currentRefSpace = refSpaceRef.current

        if (currentHitSource && currentRefSpace) {
          const hitTestResults = frame.getHitTestResults(currentHitSource)
          if (hitTestResults.length > 0) {
            const hit = hitTestResults[0]
            const pose = hit.getPose(currentRefSpace)
            if (pose) {
              const pos = pose.transform.position
              const ori = pose.transform.orientation
              setHitPose({
                position: { x: Number(pos.x.toFixed(3)), y: Number(pos.y.toFixed(3)), z: Number(pos.z.toFixed(3)) },
                quaternion: { x: Number(ori.x.toFixed(3)), y: Number(ori.y.toFixed(3)), z: Number(ori.z.toFixed(3)), w: Number(ori.w.toFixed(3)) },
              })
              setHitMatrix(Array.from(pose.transform.matrix))
            }
          } else {
            setHitPose(null)
            setHitMatrix(null)
          }
        }
      }

      animFrameIdRef.current = xrSession.requestAnimationFrame(onXRFrame)
      setSession(xrSession)
      onStarted?.()
    } catch (err) {
      console.error('AR Session initialization error:', err)
      setError(err instanceof Error ? err.message : 'Failed to start AR session')
    }
  }

  const endSession = async () => {
    if (session) {
      try {
        await session.end()
      } catch (err) {
        console.warn('Session end error:', err)
      }
    }
    handleSessionEnd()
  }

  return (
    <ARSessionContext.Provider
      value={{
        supported,
        session,
        error,
        hitPose,
        hitMatrix,
        canvasRef,
        startSession,
        endSession,
        captureCurrentFrame,
      }}
    >
      {children}
    </ARSessionContext.Provider>
  )
}
