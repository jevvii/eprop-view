'use client'

import {
  useEffect,
  useState,
  useRef,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import type { ARPose } from '@/app/types'

export type ARActiveMode = 'idle' | 'webxr' | 'optical-camera' | 'simulated'

export interface XRSessionState {
  supported: boolean | null
  xrHardwareSupported: boolean
  activeMode: ARActiveMode
  isActive: boolean
  session: XRSession | null
  error: string | null
  /** Non-fatal capability limitation, e.g. camera or motion permission denied. */
  limitation: string | null
  hitPose: ARPose | null
  hitMatrix: number[] | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  setTargetNormCoords: (nx: number, ny: number) => void
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

function eulerToQuaternion(pitch: number, roll: number, yaw: number) {
  const c1 = Math.cos(pitch / 2)
  const c2 = Math.cos(roll / 2)
  const c3 = Math.cos(yaw / 2)
  const s1 = Math.sin(pitch / 2)
  const s2 = Math.sin(roll / 2)
  const s3 = Math.sin(yaw / 2)
  return {
    x: Number((s1 * c2 * c3 + c1 * s2 * s3).toFixed(4)),
    y: Number((c1 * s2 * c3 - s1 * c2 * s3).toFixed(4)),
    z: Number((c1 * c2 * s3 - s1 * s2 * c3).toFixed(4)),
    w: Number((c1 * c2 * c3 + s1 * s2 * s3).toFixed(4)),
  }
}

function computeTransformMatrix(
  pos: { x: number; y: number; z: number },
  quat: { x: number; y: number; z: number; w: number }
): number[] {
  const { x, y, z, w } = quat
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2

  return [
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    pos.x, pos.y, pos.z, 1,
  ]
}

export function ARSessionManager({ children, onStarted, onEnded }: ARSessionManagerProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [xrHardwareSupported, setXrHardwareSupported] = useState<boolean>(false)
  const [activeMode, setActiveMode] = useState<ARActiveMode>('idle')
  const [session, setSession] = useState<XRSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limitation, setLimitation] = useState<string | null>(null)
  const [hitPose, setHitPose] = useState<ARPose | null>(null)
  const [hitMatrix, setHitMatrix] = useState<number[] | null>(null)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null)
  const refSpaceRef = useRef<XRReferenceSpace | null>(null)
  const animFrameIdRef = useRef<number | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const opticalLoopIdRef = useRef<number | null>(null)
  const scanTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sessionRef = useRef<XRSession | null>(null)
  const isStartingRef = useRef(false)
  const endedRef = useRef(false)
  const motionPermissionRef = useRef<'unknown' | 'granted' | 'denied'>('unknown')

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  // Tracking reticle target normalized coordinates [0.0..1.0] (default center 0.5, 0.5)
  const targetNormRef = useRef<{ nx: number; ny: number }>({ nx: 0.5, ny: 0.5 })
  // Mobile device orientation cache (pitch, roll, yaw)
  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number }>({
    alpha: 0,
    beta: 60,
    gamma: 0,
  })

  // Detect capabilities on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Progressive AR is ALWAYS supported through Tier 3A (camera) or Tier 3B (simulated grid)
    setSupported(true)

    if (navigator?.xr?.isSessionSupported) {
      navigator.xr
        .isSessionSupported('immersive-ar')
        .then((supportedOk) => {
          setXrHardwareSupported(Boolean(supportedOk))
        })
        .catch(() => {
          setXrHardwareSupported(false)
        })
    } else {
      setXrHardwareSupported(false)
    }
  }, [])

  // Calculate hitPose and hitMatrix from targetNormRef and device motion
  const calculateOpticalPose = useCallback((): { pose: ARPose; matrix: number[] } => {
    const { nx, ny } = targetNormRef.current
    const { alpha, beta, gamma } = orientationRef.current

    // Convert orientation angles into radians with nominal 60deg tilt anchor
    const pitchRad = (((beta ?? 60) - 60) * Math.PI) / 180
    const rollRad = ((gamma ?? 0) * Math.PI) / 180
    const yawRad = ((alpha ?? 0) * Math.PI) / 180

    // Virtual target distance: 1.45 meters (standard civil inspection depth)
    const depth = 1.45
    const gyroOffsetX = Math.sin(rollRad) * 0.35
    const gyroOffsetY = Math.sin(pitchRad) * 0.35

    const posX = Number(((nx - 0.5) * 1.5 + gyroOffsetX).toFixed(3))
    const posY = Number((-(ny - 0.5) * 1.1 - 0.15 + gyroOffsetY).toFixed(3))
    const posZ = Number((-depth).toFixed(3))

    const quat = eulerToQuaternion(pitchRad * 0.4, rollRad * 0.4, yawRad * 0.15)
    const pose: ARPose = {
      position: { x: posX, y: posY, z: posZ },
      quaternion: quat,
    }
    const matrix = computeTransformMatrix(pose.position, quat)

    return { pose, matrix }
  }, [])

  // Public setter to move reticle from viewport tap/drag
  const setTargetNormCoords = useCallback(
    (nx: number, ny: number) => {
      const clampedX = Math.min(0.95, Math.max(0.05, nx))
      const clampedY = Math.min(0.95, Math.max(0.05, ny))
      targetNormRef.current = { nx: clampedX, ny: clampedY }

      if (activeMode === 'optical-camera' || activeMode === 'simulated') {
        const { pose, matrix } = calculateOpticalPose()
        setHitPose(pose)
        setHitMatrix(matrix)
      }
    },
    [activeMode, calculateOpticalPose]
  )

  // Listen to mobile device orientation
  useEffect(() => {
    if (activeMode !== 'optical-camera' && activeMode !== 'simulated') return

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta !== null && e.gamma !== null) {
        orientationRef.current = {
          alpha: e.alpha ?? 0,
          beta: e.beta,
          gamma: e.gamma,
        }
        const { pose, matrix } = calculateOpticalPose()
        setHitPose(pose)
        setHitMatrix(matrix)
      }
    }

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation, { passive: true })
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', handleOrientation)
      }
    }
  }, [activeMode, calculateOpticalPose])

  // Create virtual session object for Tier 3 modes so `if (session)` passes seamlessly
  const createVirtualSession = useCallback((): XRSession => {
    return {
      isVirtual: true,
      mode: 'inline',
      renderState: {} as XRRenderState,
      requestAnimationFrame: (cb: XRFrameRequestCallback) => {
        return window.requestAnimationFrame((time) => cb(time, {} as XRFrame))
      },
      cancelAnimationFrame: (id: number) => {
        window.cancelAnimationFrame(id)
      },
      end: async () => {
        // Will be handled by endSession()
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    } as unknown as XRSession
  }, [])

  // Tier 3A Optical Camera render loop (draws video frame + subtle reticle to canvas)
  const startOpticalLoop = useCallback(() => {
    const renderFrame = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (canvas && video && video.readyState >= 2) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth || canvas.clientWidth || 1280
            canvas.height = video.videoHeight || canvas.clientHeight || 720
          }
          // Draw raw camera frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

          // Subtle AR Reticle overlay
          const targetX = targetNormRef.current.nx * canvas.width
          const targetY = targetNormRef.current.ny * canvas.height

          ctx.save()
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.75)'
          ctx.lineWidth = 2.5
          ctx.shadowColor = 'rgba(52, 211, 153, 0.5)'
          ctx.shadowBlur = 8

          // Outer reticle ring
          ctx.beginPath()
          ctx.arc(targetX, targetY, 28, 0, Math.PI * 2)
          ctx.stroke()

          // Center target pip
          ctx.fillStyle = '#34D399'
          ctx.beginPath()
          ctx.arc(targetX, targetY, 4, 0, Math.PI * 2)
          ctx.fill()

          // Crosshairs
          ctx.beginPath()
          ctx.moveTo(targetX - 38, targetY)
          ctx.lineTo(targetX - 14, targetY)
          ctx.moveTo(targetX + 14, targetY)
          ctx.lineTo(targetX + 38, targetY)
          ctx.moveTo(targetX, targetY - 38)
          ctx.lineTo(targetX, targetY - 14)
          ctx.moveTo(targetX, targetY + 14)
          ctx.lineTo(targetX, targetY + 38)
          ctx.stroke()

          ctx.restore()
        }
      }
      opticalLoopIdRef.current = requestAnimationFrame(renderFrame)
    }

    opticalLoopIdRef.current = requestAnimationFrame(renderFrame)
  }, [])

  // Tier 3B Simulated Optical Grid Loop (perspective structural grid + scanning laser)
  const startSimulatedLoop = useCallback(() => {
    let phase = 0

    const renderSimulated = () => {
      phase += 0.02
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const w = (canvas.width = canvas.clientWidth || 1280)
          const h = (canvas.height = canvas.clientHeight || 720)

          // Background blueprint / spatial dark field
          const grad = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h))
          grad.addColorStop(0, '#0a1020')
          grad.addColorStop(1, '#020617')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, w, h)

          // 3D Perspective Grid
          ctx.save()
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)'
          ctx.lineWidth = 1
          const horizonY = h * 0.4
          const vpX = w * 0.5

          // Vanishing lines radiating from horizon
          for (let x = -w * 0.5; x <= w * 1.5; x += w * 0.08) {
            ctx.beginPath()
            ctx.moveTo(vpX, horizonY)
            ctx.lineTo(x, h)
            ctx.stroke()
          }

          // Depth lines
          for (let i = 1; i <= 10; i++) {
            const y = horizonY + (h - horizonY) * Math.pow(i / 10, 2)
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(w, y)
            ctx.stroke()
          }
          ctx.restore()

          // Sweeping Laser Scan Line
          const scanY = ((Math.sin(phase * 1.2) + 1) / 2) * (h - 40) + 20
          ctx.save()
          const laserGrad = ctx.createLinearGradient(0, scanY - 12, 0, scanY + 12)
          laserGrad.addColorStop(0, 'rgba(52, 211, 153, 0)')
          laserGrad.addColorStop(0.5, 'rgba(52, 211, 153, 0.85)')
          laserGrad.addColorStop(1, 'rgba(52, 211, 153, 0)')
          ctx.fillStyle = laserGrad
          ctx.fillRect(0, scanY - 12, w, 24)

          ctx.strokeStyle = '#34D399'
          ctx.lineWidth = 2
          ctx.shadowColor = '#34D399'
          ctx.shadowBlur = 10
          ctx.beginPath()
          ctx.moveTo(0, scanY)
          ctx.lineTo(w, scanY)
          ctx.stroke()
          ctx.restore()

          // Simulated Surface Structural Reticle
          const tx = targetNormRef.current.nx * w
          const ty = targetNormRef.current.ny * h

          ctx.save()
          ctx.translate(tx, ty)
          ctx.rotate(phase)

          ctx.strokeStyle = '#38BDF8'
          ctx.lineWidth = 2
          ctx.shadowColor = '#38BDF8'
          ctx.shadowBlur = 12
          ctx.beginPath()
          ctx.arc(0, 0, 32, 0, Math.PI * 2)
          ctx.stroke()

          // Dashed rotation ring
          ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)'
          ctx.setLineDash([6, 6])
          ctx.beginPath()
          ctx.arc(0, 0, 44, 0, Math.PI * 2)
          ctx.stroke()

          ctx.restore()

          // Center target pip
          ctx.save()
          ctx.fillStyle = '#38BDF8'
          ctx.shadowColor = '#38BDF8'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.arc(tx, ty, 5, 0, Math.PI * 2)
          ctx.fill()

          // HUD Telemetry overlay in canvas
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
          ctx.font = 'bold 11px monospace'
          ctx.fillText(`SIMULATED SPATIAL GRID · RANGE: 1.45m`, 20, 30)
          ctx.fillText(`RAYCAST TARGET: [${tx.toFixed(0)}, ${ty.toFixed(0)}]`, 20, 48)
          ctx.restore()
        }
      }
      opticalLoopIdRef.current = requestAnimationFrame(renderSimulated)
    }

    opticalLoopIdRef.current = requestAnimationFrame(renderSimulated)
  }, [])

  // WebXR session cleanup. Guarded so an externally-ended session and an
  // explicit End click cannot both run completion twice.
  const handleSessionEnd = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true

    const currentSession = sessionRef.current
    if (animFrameIdRef.current && currentSession) {
      try {
        currentSession.cancelAnimationFrame(animFrameIdRef.current)
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
    sessionRef.current = null
    setSession(null)
    setActiveMode('idle')
    setHitPose(null)
    setHitMatrix(null)
    onEnded?.()
  }, [onEnded])

  // Full endSession handler stopping all media tracks and loops
  const endSession = useCallback(async () => {
    if (opticalLoopIdRef.current) {
      cancelAnimationFrame(opticalLoopIdRef.current)
      opticalLoopIdRef.current = null
    }

    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    if (sessionRef.current) {
      try {
        await sessionRef.current.end()
      } catch (err) {
        console.warn('Session end error:', err)
      }
    }

    handleSessionEnd()
  }, [handleSessionEnd])

  // Frame snapshot capture for inspections and anchors. Synthetic grid frames
  // are never returned as evidence.
  const captureCurrentFrame = useCallback((): string | null => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (activeMode === 'optical-camera' && video && video.readyState >= 2) {
      try {
        const width = video.videoWidth
        const height = video.videoHeight
        if (width > 0 && height > 0) {
          const offscreen = document.createElement('canvas')
          offscreen.width = width
          offscreen.height = height
          const ctx = offscreen.getContext('2d')
          if (ctx) {
            // Raw camera frame: no reticle or HUD burned into the evidence.
            ctx.drawImage(video, 0, 0, width, height)
            return offscreen.toDataURL('image/jpeg', 0.85)
          }
        }
      } catch (e) {
        console.warn('Optical snapshot capture failed:', e)
      }
    }

    if (activeMode === 'webxr' && canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        return canvas.toDataURL('image/jpeg', 0.85)
      } catch (e) {
        console.warn('WebXR canvas snapshot capture failed:', e)
      }
    }

    return null
  }, [activeMode])

  // iOS requires a user gesture before device-orientation events are delivered.
  const requestMotionPermission = useCallback(async () => {
    if (typeof DeviceOrientationEvent === 'undefined') {
      motionPermissionRef.current = 'denied'
      return false
    }

    const requestPermission = (
      DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied'>
      }
    ).requestPermission

    if (typeof requestPermission !== 'function') {
      motionPermissionRef.current = 'granted'
      return true
    }

    try {
      const result = await requestPermission()
      motionPermissionRef.current = result === 'granted' ? 'granted' : 'denied'
      return result === 'granted'
    } catch {
      motionPermissionRef.current = 'denied'
      return false
    }
  }, [])

  // Multi-tier progressive AR starter
  const startSession = useCallback(async () => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    endedRef.current = false
    setError(null)
    setLimitation(null)

    try {
      // Tier 1 & 2: WebXR hardware immersive-ar, only when genuinely supported.
      if (xrHardwareSupported && navigator?.xr) {
        try {
          const canvas = canvasRef.current
          if (!canvas) {
            throw new Error('AR canvas is not mounted.')
          }

          const gl = canvas.getContext('webgl', {
            alpha: true,
            antialias: true,
            preserveDrawingBuffer: true,
          }) as WebGLRenderingContext | null

          if (gl) {
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

            let refSpace: XRReferenceSpace
            try {
              refSpace = await xrSession.requestReferenceSpace('local-floor')
            } catch {
              refSpace = await xrSession.requestReferenceSpace('local')
            }
            refSpaceRef.current = refSpace

            if (xrSession.requestHitTestSource) {
              try {
                const viewerSpace = await xrSession.requestReferenceSpace('viewer')
                const hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace })
                hitTestSourceRef.current = hitTestSource
              } catch (e) {
                console.warn('Hit test source request failed:', e)
              }
            }

            sessionRef.current = xrSession
            xrSession.addEventListener('end', handleSessionEnd)

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
                      position: {
                        x: Number(pos.x.toFixed(3)),
                        y: Number(pos.y.toFixed(3)),
                        z: Number(pos.z.toFixed(3)),
                      },
                      quaternion: {
                        x: Number(ori.x.toFixed(3)),
                        y: Number(ori.y.toFixed(3)),
                        z: Number(ori.z.toFixed(3)),
                        w: Number(ori.w.toFixed(3)),
                      },
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
            setActiveMode('webxr')
            onStarted?.()
            return
          }
        } catch (xrErr) {
          console.warn('WebXR hardware session failed, falling back to the optical camera:', xrErr)
        }
      }

      // Tier 3A: live rear camera with a screen-space reticle.
      if (navigator?.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        try {
          const motionAllowed = await requestMotionPermission()
          if (!motionAllowed) {
            setLimitation('Motion tracking is unavailable (permission denied). Tap the view to aim the marker.')
          }

          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          })

          mediaStreamRef.current = stream

          if (videoRef.current) {
            videoRef.current.srcObject = stream
            await videoRef.current.play().catch(() => {})
          }

          const virtualSession = createVirtualSession()
          sessionRef.current = virtualSession
          setSession(virtualSession)
          setActiveMode('optical-camera')
          startOpticalLoop()

          // Brief surface-lock animation; the pose is screen-space, not a plane.
          setHitPose(null)
          scanTimerRef.current = setTimeout(() => {
            const { pose, matrix } = calculateOpticalPose()
            setHitPose(pose)
            setHitMatrix(matrix)
          }, 800)

          onStarted?.()
          return
        } catch (mediaErr) {
          console.warn('Camera unavailable or denied; using the simulated grid:', mediaErr)
          setLimitation(
            'Camera access was denied or unavailable. Showing a simulated grid; no image evidence will be captured.'
          )
        }
      } else {
        setLimitation(
          'This browser has no camera API. Showing a simulated grid; no image evidence will be captured.'
        )
      }

      // Tier 3B: simulated grid. Clearly a training/placement aid, not tracking.
      const virtualSession = createVirtualSession()
      sessionRef.current = virtualSession
      setSession(virtualSession)
      setActiveMode('simulated')
      startSimulatedLoop()

      setHitPose(null)
      scanTimerRef.current = setTimeout(() => {
        const { pose, matrix } = calculateOpticalPose()
        setHitPose(pose)
        setHitMatrix(matrix)
      }, 600)

      onStarted?.()
    } finally {
      isStartingRef.current = false
    }
  }, [
    xrHardwareSupported,
    handleSessionEnd,
    onStarted,
    createVirtualSession,
    startOpticalLoop,
    calculateOpticalPose,
    startSimulatedLoop,
    requestMotionPermission,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (opticalLoopIdRef.current) {
        cancelAnimationFrame(opticalLoopIdRef.current)
      }
      if (animFrameIdRef.current && sessionRef.current) {
        try {
          sessionRef.current.cancelAnimationFrame(animFrameIdRef.current)
        } catch {}
      }
      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current)
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (hitTestSourceRef.current) {
        try {
          hitTestSourceRef.current.cancel()
        } catch {}
      }
      if (sessionRef.current) {
        sessionRef.current.end().catch(() => {})
      }
    }
  }, [])

  return (
    <ARSessionContext.Provider
      value={{
        supported,
        xrHardwareSupported,
        activeMode,
        isActive: activeMode !== 'idle',
        session,
        error,
        limitation,
        hitPose,
        hitMatrix,
        videoRef,
        canvasRef,
        setTargetNormCoords,
        startSession,
        endSession,
        captureCurrentFrame,
      }}
    >
      {children}
    </ARSessionContext.Provider>
  )
}
