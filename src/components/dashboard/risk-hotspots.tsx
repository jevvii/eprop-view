'use client'

import { useMemo, useRef, useState } from 'react'
import { useRiskHotspots } from '@/app/lib/queries'
import type { RiskHotspot } from '@/app/types'

type TooltipState = {
  x: number
  y: number
  title: string
  description: string
}

const severityStyles: Record<RiskHotspot['severity'], string> = {
  critical: 'bg-red-500',
  moderate: 'bg-amber-400',
  low: 'bg-emerald-500',
}

export function RiskHotspots() {
  const { data: hotspots, isLoading, isError } = useRiskHotspots()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)

  const sortedHotspots = useMemo(() => {
    if (!hotspots) return []
    return [...hotspots].sort((a, b) => a.severity.localeCompare(b.severity))
  }, [hotspots])

  const handleMouseMove = (event: React.MouseEvent, hotspot: RiskHotspot) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = event.clientX - rect.left + 12
    const y = event.clientY - rect.top - 6
    setTooltip({
      x,
      y,
      title: hotspot.title,
      description: hotspot.description || 'No description provided.',
    })
  }

  const handleMouseLeave = () => {
    setTooltip(null)
  }

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-72 animate-pulse" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load risk hotspots
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 tracking-wide">SITE CRITICAL RISK HOTSPOTS</h3>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 text-slate-500">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Critical
          </span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Moderate
          </span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Low
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-64 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.15)_1px,transparent_1px)] bg-[size:28px_28px]" />
        {sortedHotspots.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            No hotspots recorded.
          </div>
        ) : (
          sortedHotspots.map((hotspot) => (
            <button
              key={hotspot.id}
              type="button"
              aria-label={hotspot.title}
              className={`absolute h-3.5 w-3.5 rounded-full shadow-sm ring-2 ring-white/80 ${severityStyles[hotspot.severity]}`}
              style={{
                top: `${Math.min(Math.max(hotspot.position_y, 0), 100)}%`,
                left: `${Math.min(Math.max(hotspot.position_x, 0), 100)}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onMouseMove={(event) => handleMouseMove(event, hotspot)}
              onMouseLeave={handleMouseLeave}
              onFocus={(event) => handleMouseMove(event, hotspot)}
              onBlur={handleMouseLeave}
            />
          ))
        )}

        {tooltip && (
          <div
            className="absolute z-10 max-w-[220px] rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-semibold">{tooltip.title}</div>
            <div className="text-slate-200">{tooltip.description}</div>
          </div>
        )}
      </div>
      <div className="text-xs text-slate-400">Hover a hotspot to view details.</div>
    </div>
  )
}
