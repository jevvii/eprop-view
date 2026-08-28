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
      {anchors.map((anchor) => {
        // Reproject 3D camera pose (x, y, z) into 2D viewport coordinates
        const depth = Math.max(0.4, Math.abs(anchor.pose?.position?.z ?? 1.5))
        const posX = Math.min(90, Math.max(10, 50 + ((anchor.pose?.position?.x ?? 0) / depth) * 35))
        const posY = Math.min(85, Math.max(15, 50 - ((anchor.pose?.position?.y ?? 0) / depth) * 35))

        return (
          <div
            key={anchor.id}
            className="absolute transition-all duration-300 -translate-x-1/2 -translate-y-1/2 pointer-events-auto group"
            style={{
              left: `${posX}%`,
              top: `${posY}%`,
            }}
          >
            {/* Spatial Pin Indicator */}
            <div className="flex flex-col items-center">
              <div className="bg-slate-900/90 backdrop-blur-md text-white px-3 py-2 rounded-2xl border border-white/20 shadow-2xl space-y-1 hover:scale-105 transition-transform">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white">
                    📍 {anchor.label}
                  </span>
                  {anchor.severity && <SeverityBadge severity={anchor.severity} />}
                </div>

                <div className="flex items-center justify-between gap-3 text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>{anchor.damage_type ?? 'structural defect'}</span>
                  <span className="font-mono text-slate-500">
                    {anchor.pose?.position?.z ? `${Math.abs(anchor.pose.position.z).toFixed(1)}m` : ''}
                  </span>
                </div>
              </div>

              {/* Pin Pointer */}
              <div className="w-1.5 h-3 bg-gradient-to-b from-slate-900 to-transparent" />
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] ring-2 ring-white/50" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
