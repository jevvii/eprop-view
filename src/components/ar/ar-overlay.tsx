'use client'

import type { ARAnchor } from '@/app/types'
import { SeverityBadge } from '@/components/ai/severity-badge'

interface AROverlayProps {
  anchors: ARAnchor[]
}

export function AROverlay({ anchors }: AROverlayProps) {
  if (anchors.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {anchors.map((anchor, index) => {
        // Reproject 3D camera pose (x, y, z) into 2D viewport coordinates with perspective division
        const depth = Math.max(0.4, Math.abs(anchor.pose?.position?.z ?? 1.45))
        const rawX = anchor.pose?.position?.x ?? 0
        const rawY = anchor.pose?.position?.y ?? 0

        // Perspective projection factor
        const fovSpread = depth * 0.75
        const normOffsetX = (rawX / fovSpread) * 38
        const normOffsetY = (rawY / fovSpread) * 38

        // Stagger slightly if multiple anchors overlap tightly
        const staggerX = ((index % 3) - 1) * 1.8
        const staggerY = Math.floor(index / 3) * 1.2

        const posX = Math.min(92, Math.max(8, 50 + normOffsetX + staggerX))
        const posY = Math.min(88, Math.max(12, 50 - normOffsetY + staggerY))

        // Distance scaling (near = 1.1x, far = 0.8x)
        const scale = Math.min(1.1, Math.max(0.78, 1.3 / depth))
        const snapshotUrl = (anchor as unknown as { image_url?: string }).image_url || anchor.snapshot_path

        return (
          <div
            key={anchor.id}
            className="absolute transition-all duration-300 -translate-x-1/2 -translate-y-1/2 pointer-events-auto group z-20 hover:z-30"
            style={{
              left: `${posX}%`,
              top: `${posY}%`,
              transform: `translate(-50%, -50%) scale(${scale})`,
            }}
          >
            {/* Spatial Pin Card */}
            <div className="flex flex-col items-center">
              <div className="bg-slate-900/95 backdrop-blur-md text-white p-2 sm:p-2.5 rounded-2xl border border-white/20 shadow-2xl space-y-1 hover:scale-105 transition-transform max-w-[210px]">
                <div className="flex items-center gap-2">
                  {snapshotUrl && (
                    <img
                      src={snapshotUrl}
                      alt={anchor.label}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover border border-white/20 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black uppercase tracking-wider text-white truncate">
                      📍 {anchor.label}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {anchor.severity && <SeverityBadge severity={anchor.severity} />}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider pt-0.5 border-t border-white/10">
                  <span className="truncate">{anchor.damage_type ?? 'structural'}</span>
                  <span className="font-mono text-emerald-400 shrink-0 tabular-nums">
                    {anchor.pose?.position?.z ? `${Math.abs(anchor.pose.position.z).toFixed(1)}m` : '1.5m'}
                  </span>
                </div>
              </div>

              {/* Pin Pointer Vector */}
              <div className="w-1.5 h-3 bg-gradient-to-b from-slate-900 to-transparent" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] ring-2 ring-white/60 animate-pulse" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
