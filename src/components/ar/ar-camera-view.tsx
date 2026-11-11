'use client'
import { Camera, MapPin, ScanSearch } from 'lucide-react'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useARSessionContext } from './ar-session-manager'

interface ARCameraViewProps {
  onTapToAnchor?: () => void
  /** Capture the current frame as evidence. */
  onCapture?: () => void
  /** Capture and run the heuristic analysis on it. */
  onAnalyze?: () => void
  isScanning?: boolean
  captureDisabled?: boolean
}

/**
 * Camera surface.
 *
 * The video element stays mounted and laid out at all times and is hidden with
 * opacity. Toggling it with `display: none` made iOS and several Android
 * WebViews stop decoding frames: play() resolved, readyState stayed low, and the
 * preview was black. Keeping it continuously rendered is the fix.
 */
export function ARCameraView({
  onTapToAnchor,
  onCapture,
  onAnalyze,
  isScanning = false,
  captureDisabled = false,
}: ARCameraViewProps) {
  const {
    session,
    isActive,
    activeMode,
    xrHardwareSupported,
    hitPose,
    videoRef,
    canvasRef,
    setTargetNormCoords,
  } = useARSessionContext()

  const [reticlePos, setReticlePos] = useState<{ xPercent: number; yPercent: number }>({
    xPercent: 50,
    yPercent: 50,
  })
  const [videoLive, setVideoLive] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const playedOnceRef = useRef(false)

  const isCameraMode = activeMode === 'optical-camera'

  /**
   * Prepare the video element for mobile autoplay, then attempt playback.
   *
   * `muted` is set as a property rather than trusted from the attribute: a
   * server-rendered video whose muted attribute did not survive hydration is
   * blocked by the autoplay policy on iOS and Android.
   */
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', 'true')

    if (isCameraMode) {
      void video.play().catch(() => setVideoLive(false))
    }
  }, [isCameraMode, videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const markLive = () => {
      if (video.readyState >= 2) {
        playedOnceRef.current = true
        setVideoLive(true)
      }
    }

    video.addEventListener('loadeddata', markLive)
    video.addEventListener('playing', markLive)
    video.addEventListener('timeupdate', markLive)

    return () => {
      video.removeEventListener('loadeddata', markLive)
      video.removeEventListener('playing', markLive)
      video.removeEventListener('timeupdate', markLive)
    }
  }, [videoRef])

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isActive) return
      const target = e.target as HTMLElement
      if (target.closest('button')) return

      const video = videoRef.current
      if (video?.paused) {
        void video.play().catch(() => {})
      }

      if (activeMode === 'webxr') return

      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const rawNx = (e.clientX - rect.left) / rect.width
        const rawNy = (e.clientY - rect.top) / rect.height
        const nx = Math.min(0.95, Math.max(0.05, rawNx))
        const ny = Math.min(0.95, Math.max(0.05, rawNy))

        setReticlePos({ xPercent: nx * 100, yPercent: ny * 100 })
        setTargetNormCoords(nx, ny)
      }
    },
    [isActive, setTargetNormCoords, videoRef, activeMode]
  )

  const getModeBadge = () => {
    switch (activeMode) {
      case 'webxr':
        return {
          label: 'WebXR hit-test',
          classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        }
      case 'optical-camera':
        return {
          label: 'Camera + screen markers',
          classes: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
        }
      case 'simulated':
        return {
          label: 'Simulated grid (no camera)',
          classes: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        }
      default:
        return {
          label: 'Standby',
          classes: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
        }
    }
  }

  const badge = getModeBadge()
  const isSpatial = activeMode === 'webxr'
  const statusLabel = isSpatial
    ? hitPose
      ? 'Surface locked'
      : 'Scanning planes…'
    : !videoLive
      ? 'Starting camera…'
      : hitPose
        ? 'Screen marker ready'
        : 'Tap to aim'

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${
        activeMode === 'webxr' ? 'bg-transparent' : 'bg-slate-950'
      } ${isActive ? 'touch-none' : 'touch-pan-y'}`}
      onPointerDown={handlePointer}
      onPointerMove={(e) => {
        if (e.buttons === 1) handlePointer(e)
      }}
    >
      {/* Raw camera feed. Always mounted; visibility is opacity, never display. */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        preload="auto"
        disablePictureInPicture
        controls={false}
        aria-hidden={!isCameraMode}
        onPlaying={() => {
          if (videoRef.current && videoRef.current.readyState >= 2) {
            playedOnceRef.current = true
            setVideoLive(true)
          }
        }}
        onLoadedData={() => {
          const video = videoRef.current
          if (video && video.readyState >= 2) {
            playedOnceRef.current = true
            setVideoLive(true)
          }
          void videoRef.current?.play().catch(() => {})
        }}
        // Buffering after a successful start is not a stopped camera. Only a
        // video that has never produced a frame counts as not live.
        onWaiting={() => {
          const video = videoRef.current
          if (!video || video.readyState < 2 || !playedOnceRef.current) setVideoLive(false)
        }}
        onPause={() => setVideoLive(false)}
        onStalled={() => {
          const video = videoRef.current
          if (!video || video.readyState < 2) setVideoLive(false)
        }}
        // The camera preview is the video element itself. Visibility is opacity,
        // never display: a hidden video is throttled on iOS.
        className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
          isCameraMode ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/*
        The canvas is what the user sees, in every mode. A MediaStream video
        element renders black inside a rounded, overflow-hidden container on iOS
        and some Android GPU drivers even though its frames are intact — capture
        returns a real image while the element paints nothing. The session manager
        copies the camera frames onto this canvas, which renders reliably.
      */}
      {/* Simulated grid and the WebXR composition surface. */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 ${
          isCameraMode ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      />

      {isCameraMode && !videoLive && (
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current
            if (!video) return
            video.muted = true
            void video.play().then(() => setVideoLive(true)).catch(() => setVideoLive(false))
          }}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-slate-950/85 px-6 text-center text-white"
        >
          <span className="text-sm font-semibold">Tap to start the camera preview</span>
          <span className="max-w-xs text-xs text-slate-300">
            Some browsers block automatic playback. If it stays black after tapping, open the
            diagnostics below.
          </span>
        </button>
      )}

      {isActive ? (
        <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 sm:p-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full backdrop-blur-md border shadow-lg ${badge.classes}`}
              >
                {badge.label}
              </span>

              <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-white shadow-lg">
                <span
                  className={`h-2 w-2 rounded-full ${
                    hitPose ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <span className="text-xs font-black uppercase tracking-widest">{statusLabel}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setDiagnosticsOpen((open) => !open)
                }}
                aria-expanded={diagnosticsOpen}
                className="pointer-events-auto min-h-[36px] rounded-lg border border-white/20 bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/80 backdrop-blur-md"
              >
                {diagnosticsOpen ? 'Hide device info' : 'Device info'}
              </button>

              {hitPose && (
                <div className="bg-black/80 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 text-right text-white shadow-lg">
                  <div className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    {isSpatial ? 'WebXR pose' : 'Estimated pose'}
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                    X:{hitPose.position.x.toFixed(2)} Y:{hitPose.position.y.toFixed(2)} Z:
                    {hitPose.position.z.toFixed(2)}m
                  </div>
                </div>
              )}
            </div>
          </div>

          {diagnosticsOpen && <DeviceDiagnostics />}

          <div
            className={`transition-transform duration-75 pointer-events-none ${
              isSpatial ? 'fixed' : 'absolute'
            }`}
            style={{
              left: isSpatial ? '50%' : `${reticlePos.xPercent}%`,
              top: isSpatial ? '50%' : `${reticlePos.yPercent}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {hitPose ? (
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-emerald-400/90 shadow-[0_0_20px_rgba(52,211,153,0.6)] flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full border border-dashed border-emerald-300 animate-spin" />
                  <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md ring-2 ring-white/60" />
                </div>
                <span className="absolute -bottom-6 bg-black/85 backdrop-blur-md text-emerald-300 text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-emerald-500/40 whitespace-nowrap shadow-lg">
                  {isSpatial ? 'Surface hit' : 'Screen-space target · ~1.45 m est.'}
                </span>
              </div>
            ) : (
              <div className="w-12 h-12 rounded-full border border-white/30 flex items-center justify-center animate-pulse">
                <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between pointer-events-auto">
            <p className="text-xs font-black text-white/90 bg-black/70 backdrop-blur-md px-3 sm:px-4 py-2 rounded-xl border border-white/10 uppercase tracking-wider max-w-[260px] sm:max-w-md shadow-lg">
              {isSpatial
                ? 'Aim the centre reticle at a surface, then place a marker'
                : 'Tap the view to aim, then capture or place a marker'}
            </p>

            {/* Capture, analyse and mark sit on the viewport itself: the inspector
                is looking here, not at a form further down the page. */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {onCapture && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCapture()
                  }}
                  disabled={captureDisabled}
                  className="flex items-center gap-1.5 bg-white/95 hover:bg-white active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-slate-900 font-black text-[11px] sm:text-xs px-3 sm:px-4 py-3 rounded-2xl shadow-lg transition-all min-h-[44px]"
                  aria-label="Capture frame"
                >
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  <span className="uppercase tracking-wider">Capture</span>
                </button>
              )}

              {onAnalyze && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void onAnalyze()
                  }}
                  disabled={isScanning || captureDisabled}
                  className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-600 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-[11px] sm:text-xs px-3 sm:px-4 py-3 rounded-2xl shadow-lg shadow-sky-500/30 transition-all min-h-[44px]"
                  aria-label="Analyze frame"
                >
                  <ScanSearch className="h-4 w-4" aria-hidden="true" />
                  <span className="uppercase tracking-wider">{isScanning ? 'Analyzing…' : 'Analyze'}</span>
                </button>
              )}

              {onTapToAnchor && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onTapToAnchor()
                  }}
                  disabled={!hitPose}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-slate-950 font-black text-xs sm:text-sm px-4 py-3 rounded-2xl shadow-xl shadow-emerald-500/30 transition-all border border-emerald-300 min-h-[44px] min-w-[44px]"
                  aria-label="Drop Quick Marker"
                >
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                  <span className="font-extrabold uppercase tracking-wider">Marker</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center z-10 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-sm space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-3xl shadow-2xl" />
            <div>
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-widest">
                AR camera standby
              </h3>
              <p className="text-xs font-bold uppercase tracking-wider mt-1.5 leading-relaxed text-slate-400">
                Connect to an inspection and press Start AR Session to begin real-time optical
                tracking.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-2 flex-wrap text-xs font-black uppercase tracking-wider">
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                Camera: Rear WebRTC
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300">
                Tracking: WebXR or tap-to-aim
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-emerald-400">
                {xrHardwareSupported ? 'WebXR: Supported' : 'Fallback: Progressive Tier 3'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Device facts that decide whether the camera can start at all.
 *
 * Every field here is read from the browser at render time. It exists because
 * "AR does not work" is unfalsifiable without knowing which precondition failed:
 * an insecure origin, a missing mediaDevices API, a denied permission, or an XR
 * capability that never presents.
 */
function DeviceDiagnostics() {
  const { activeMode, videoRef, xrHardwareSupported } = useARSessionContext()
  const [permission, setPermission] = useState<string>('unknown')
  const [secure, setSecure] = useState<string>('unknown')
  const [cameraApi, setCameraApi] = useState<string>('unknown')
  const [canvasState, setCanvasState] = useState<string>('unknown')
  const [videoBox, setVideoBox] = useState<string>('unknown')
  const [viewport, setViewport] = useState<string>('unknown')

  useEffect(() => {
    const sampleLayout = () => {
      const canvas = document.querySelector('canvas')
      if (!canvas) {
        setCanvasState('no canvas in the document')
      } else {
        setCanvasState(
          canvas.getContext('2d')
            ? '2D ok'
            : 'BLOCKED — this canvas already holds a non-2D context'
        )
      }

      // The measurement that would have caught the collapsed preview in one
      // look: a healthy decode with a zero-height box is a layout bug, not a
      // camera bug.
      const video = document.querySelector('video')
      setVideoBox(
        video
          ? `${video.clientWidth}×${video.clientHeight} css`
          : 'no video element'
      )

      setViewport(
        `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio ?? 1}x`
      )
    }

    sampleLayout()
    const timer = setInterval(sampleLayout, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setSecure(
      typeof window === 'undefined'
        ? 'unknown'
        : window.isSecureContext
          ? 'yes (HTTPS or localhost)'
          : 'NO — camera is blocked on an insecure origin'
    )
    setCameraApi(
      typeof navigator !== 'undefined' &&
        typeof navigator.mediaDevices?.getUserMedia === 'function'
        ? 'available'
        : 'missing from this browser or origin'
    )

    // Permissions.query is absent in Safari and rejects for the camera name in
    // some browsers; both paths land on "not queryable" rather than throwing.
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((status) => {
        setPermission(status.state)
        status.onchange = () => setPermission(status.state)
      })
      .catch(() => setPermission('not queryable in this browser'))
  }, [])

  const video = videoRef.current
  const frames = video
    ? `${video.videoWidth}×${video.videoHeight} · readyState ${video.readyState}${video.paused ? ' · paused' : ' · playing'}`
    : 'video element not mounted'

  const rows: [string, string][] = [
    ['Build', (process.env.NEXT_PUBLIC_BUILD_SHA ?? 'local').slice(0, 7)],
    ['Viewport', viewport],
    ['Secure context', secure],
    ['Camera API', cameraApi],
    ['Camera permission', permission],
    ['WebXR immersive-ar', xrHardwareSupported ? 'reported supported' : 'not supported'],
    ['Active mode', activeMode],
    ['Video box', videoBox],
    ['Video decoded', frames],
    ['Display canvas', canvasState],
  ]

  return (
    <div className="pointer-events-auto mt-2 max-w-sm rounded-xl border border-white/15 bg-black/80 p-3 text-left text-[10px] font-mono leading-relaxed text-white/80 backdrop-blur-md">
      <p className="mb-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
        Device capabilities
      </p>
      <dl className="space-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-28 shrink-0 text-white/50">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
