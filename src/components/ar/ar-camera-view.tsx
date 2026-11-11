'use client'

import { MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ARPose } from '@/app/types'
import { videoToViewport, type Point2D, type ReferenceTrackingFrame, type Size2D } from '@/app/lib/ar/printed-reference'
import { useARSessionContext } from './ar-session-manager'

interface ARCameraViewProps {
  onTapToAnchor?: () => void
  onAimChange: (point: Point2D) => void
  aim: Point2D
  frame: ReferenceTrackingFrame | null
  viewport: Size2D
  placementPose: ARPose | null
  trackingStatus: string
  trackingMessage?: string | null
  placing?: boolean
}

export function ARCameraView({ onTapToAnchor, onAimChange, aim, frame, viewport,
  placementPose, trackingStatus, trackingMessage, placing }: ARCameraViewProps) {
  const { isActive, activeMode, videoRef, canvasRef } = useARSessionContext()
  const [videoLive, setVideoLive] = useState(false)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.setAttribute('webkit-playsinline', 'true')
    video.muted = true
    if (activeMode === 'optical-camera') void video.play().catch(() => setVideoLive(false))
    else setVideoLive(false)
  }, [activeMode, videoRef])

  const canPlace = !!placementPose && videoLive && !placing
  const status = !videoLive ? 'Starting camera…' : frame ? 'Reference tracked' : trackingStatus === 'lost' ? 'Reference lost' : 'Find printed target'
  const points = frame ? [frame.corners.topLeft, frame.corners.topRight, frame.corners.bottomRight, frame.corners.bottomLeft]
    .map((point) => videoToViewport(point, { width: frame.imageWidth, height: frame.imageHeight }, viewport))
    .map((point) => `${point.x},${point.y}`).join(' ') : ''
  const aimAt = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isActive || (event.target as HTMLElement).closest('button')) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width && rect.height) onAimChange({ x: Math.min(.95, Math.max(.05, (event.clientX - rect.left) / rect.width)),
      y: Math.min(.95, Math.max(.05, (event.clientY - rect.top) / rect.height)) })
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-slate-950 select-none ${isActive ? 'touch-none' : ''}`}
      onPointerDown={aimAt} onPointerMove={(event) => { if (event.buttons === 1) aimAt(event) }}>
      <video ref={videoRef} playsInline muted autoPlay onPlaying={() => setVideoLive(true)}
        onPause={() => setVideoLive(false)}
        onLoadedData={() => { void videoRef.current?.play().catch(() => setVideoLive(false)) }}
        className="absolute inset-0 h-full w-full object-cover" style={{ display: activeMode === 'optical-camera' ? 'block' : 'none' }} />
      <canvas ref={canvasRef} className="hidden" />
      {activeMode === 'optical-camera' && !videoLive && (
        <button type="button" onClick={() => { void videoRef.current?.play().catch(() => setVideoLive(false)) }}
          className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/85 px-6 text-sm font-semibold text-white">
          Tap to resume the camera preview
        </button>
      )}
      {isActive ? <>
        {frame && <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden="true"
          viewBox={`0 0 ${viewport.width || 1} ${viewport.height || 1}`}>
          <polygon points={points} fill="rgba(52,211,153,0.08)" stroke="#34d399" strokeWidth={2} />
        </svg>}
        <div className="absolute inset-0 z-30 flex flex-col justify-between p-3 sm:p-5 pointer-events-none">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className="rounded-full border border-white/20 bg-black/75 px-3 py-2 text-xs font-semibold text-white">Printed reference AR</span>
            <span role="status" className={`rounded-full bg-black/75 px-3 py-2 text-xs font-semibold ${frame ? 'text-emerald-300' : 'text-amber-300'}`}>{status}</span>
            {frame && <span className="max-w-full truncate rounded-lg bg-black/75 px-3 py-1.5 text-xs text-white">{frame.target.label}</span>}
          </div>
          <div className={`absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${placementPose ? 'border-emerald-300' : 'border-amber-300'}`}
            style={{ left: `${aim.x * 100}%`, top: `${aim.y * 100}%` }} aria-hidden="true">
            <span className={`absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${placementPose ? 'bg-emerald-300' : 'bg-amber-300'}`} />
          </div>
          <div className="space-y-2">
            <p className="rounded-lg bg-black/75 px-3 py-2 text-xs leading-relaxed text-white" role={trackingMessage ? 'status' : undefined}>
              {trackingMessage || (frame ? 'Tap the point to mark on this flat surface. Keep the printed target in view.' : 'Show the entire printed target. Markers stay hidden until its position is tracked.')}
            </p>
            {onTapToAnchor && <button type="button" onClick={onTapToAnchor} disabled={!canPlace} aria-label="Drop Quick Marker"
              className="pointer-events-auto flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">
              <MapPin className="h-5 w-5" aria-hidden="true" />{placing ? 'Saving marker…' : 'Quick Marker + photo'}
            </button>}
          </div>
        </div>
      </> : <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3 text-white">
          <MapPin className="mx-auto h-10 w-10 text-emerald-300" aria-hidden="true" />
          <h3 className="text-base font-semibold">Printed reference inspection</h3>
          <p className="text-sm leading-relaxed text-slate-300">Download and attach a reference target, then start the camera. Saved markers return when you scan their original target.</p>
        </div>
      </div>}
    </div>
  )
}
