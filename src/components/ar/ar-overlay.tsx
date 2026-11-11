'use client'

import type { ARAnchor } from '@/app/types'
import { projectReferenceMarker, type ReferenceTrackingFrame, type Size2D } from '@/app/lib/ar/printed-reference'
import { SeverityBadge } from '@/components/ai/severity-badge'

interface AROverlayProps { anchors: ARAnchor[]; frame: ReferenceTrackingFrame | null; viewport: Size2D }

export function AROverlay({ anchors, frame, viewport }: AROverlayProps) {
  if (!frame) return null
  return <div className="absolute inset-0 z-20 overflow-hidden pointer-events-none" aria-label="Tracked inspection markers">
    {anchors.map((anchor) => {
      const point = projectReferenceMarker(anchor.pose, frame, viewport)
      if (!point) return null
      return <div key={anchor.id} data-marker-id={anchor.id}
        className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-full"
        style={{ left: point.x, top: point.y }}>
        <div className="max-w-[180px] rounded-xl border border-white/20 bg-slate-900/95 p-2 text-white shadow-lg">
          <p className="truncate text-xs font-semibold">{anchor.label}</p>
          {anchor.severity && <SeverityBadge severity={anchor.severity} />}
          {anchor.image_url && <img src={anchor.image_url} alt={`Evidence for ${anchor.label}`} className="mt-1 h-10 w-14 rounded object-cover" />}
        </div>
        <div className="h-3 w-px bg-emerald-300" />
        <div className="h-2 w-2 rounded-full bg-emerald-300 ring-2 ring-white" />
      </div>
    })}
  </div>
}
