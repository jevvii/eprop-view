'use client'

import type { ARAnchor } from '@/app/types'
import { SeverityBadge } from '@/components/ai/severity-badge'

interface AROverlayProps {
  anchors: ARAnchor[]
}

export function AROverlay({ anchors }: AROverlayProps) {
  if (anchors.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none">
      {anchors.map((anchor) => (
        <div
          key={anchor.id}
          className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2"
        >
          <div className="bg-slate-900/90 text-white px-3 py-2 rounded-xl border border-white/10 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-wider">{anchor.label}</span>
              {anchor.severity && <SeverityBadge severity={anchor.severity} />}
            </div>
            {anchor.damage_type && (
              <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                {anchor.damage_type} detected
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
