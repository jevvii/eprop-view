'use client'
import { MapPin } from 'lucide-react'

import { useState, useCallback } from 'react'
import { useARSessionContext } from './ar-session-manager'

interface ARCameraViewProps {
  onTapToAnchor?: () => void
}

export function ARCameraView({ onTapToAnchor }: ARCameraViewProps) {
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

  // Track visual position of reticle in percentages for DOM HUD
  const [reticlePos, setReticlePos] = useState<{ xPercent: number; yPercent: number }>({
    xPercent: 50,
    yPercent: 50,
  })

  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isActive) return
      // Don't intercept pointer events from buttons
      const target = e.target as HTMLElement
      if (target.closest('button')) return

      const video = videoRef.current
      if (video?.paused) {
        void video.play().catch(() => {})
      }

      // In WebXR the hit-test is the viewer centre, so the reticle is fixed.
      if (activeMode === 'webxr') return

      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const rawNx = (e.clientX - rect.left) / rect.width
        const rawNy = (e.clientY - rect.top) / rect.height
        const nx = Math.min(0.95, Math.max(0.05, rawNx))
        const ny = Math.min(0.95, Math.max(0.05, rawNy))

        setReticlePos({
          xPercent: nx * 100,
          yPercent: ny * 100,
        })
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
        // Allow drag-aiming on mobile touch
        if (e.buttons === 1) handlePointer(e)
      }}
    >
      {/* Live WebRTC Camera Video (Tier 3A Optical Mode) */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300"
        style={{
          display: activeMode === 'optical-camera' ? 'block' : 'none',
        }}
      />

      {/* Render Canvas (WebXR or Tier 3B Simulated Grid or frame capture buffer) */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300"
        style={{
          display: activeMode === 'optical-camera' ? 'none' : 'block',
        }}
      />

      {/* Active HUD Telemetry Overlay */}
      {isActive ? (
        <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 sm:p-5">
          {/* Top Telemetry Header Bar */}
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
                <span className="text-xs font-black uppercase tracking-widest">
                  {statusLabel}
                </span>
              </div>
            </div>

            {hitPose && (
              <div className="bg-black/80 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 text-right text-white shadow-lg">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  {isSpatial ? 'WebXR pose' : 'Estimated pose'}
                </div>
                <div className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                  X:{hitPose.position.x.toFixed(2)} Y:{hitPose.position.y.toFixed(2)} Z:{hitPose.position.z.toFixed(2)}m
                </div>
              </div>
            )}
          </div>

          {/* Interactive Dynamic Reticle. In WebXR the hit test is the viewer
              centre, so the reticle is fixed to the viewport centre. */}
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
                {/* 3D Surface Target Reticle */}
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

          {/* Bottom Controls & Action Bar */}
          <div className="flex items-end justify-between gap-3 pointer-events-auto">
            {/* Helper Prompt */}
            <p className="text-xs font-black text-white/90 bg-black/70 backdrop-blur-md px-3 sm:px-4 py-2 rounded-xl border border-white/10 uppercase tracking-wider max-w-[260px] sm:max-w-md shadow-lg">
              {isSpatial
                ? 'Aim the centre reticle at a surface, then place a marker'
                : 'Tap the view to aim, then place a marker'}
            </p>

            {/* Quick Anchor Drop Button */}
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
                <span className="font-extrabold uppercase tracking-wider">Quick Marker</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Standby State */
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center z-10 bg-slate-950/80 backdrop-blur-sm">
          <div className="max-w-sm space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-3xl shadow-2xl">
                          </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-widest">
                AR camera standby
              </h3>
              <p className="text-xs sm:text-xs text-slate-400 font-bold uppercase tracking-wider mt-1.5 leading-relaxed">
                Connect to an inspection and press Start AR Session to begin real-time optical tracking.
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
