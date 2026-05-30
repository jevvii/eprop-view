'use client'

import { useRiskHotspots } from '@/app/lib/queries'
import { useRef, useState } from 'react'

const severityStyles: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  moderate: 'bg-amber-400',
  low: 'bg-emerald-500',
}

export function RiskHotspots() {
  const { data: hotspots, isLoading, isError } = useRiskHotspots()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; description: string } | null>(null)

  const handleMouseMove = (event: React.MouseEvent, hotspot: any) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({
      x: event.clientX - rect.left + 10,
      y: event.clientY - rect.top + 10,
      title: hotspot.title,
      description: hotspot.description || 'No description.',
    })
  }

  const handleMouseLeave = () => setTooltip(null)

  if (isLoading) {
    return <div className="bg-white p-8 rounded-[2rem] shadow-sm animate-pulse h-64 border border-slate-100" />
  }

  if (isError) {
    return (
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-red-100 text-red-600 font-bold uppercase tracking-widest text-center">
        Hotspot Telemetry Offline
      </div>
    )
  }

  const sortedHotspots = hotspots?.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, moderate: 2, low: 3 }
    return (order[a.severity] ?? 99) - (order[b.severity] ?? 99)
  }) || []

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-[0.65rem] font-black text-slate-400 tracking-[0.15em] uppercase">Sector Hotspots</h3>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-60 rounded-[1.8rem] border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100/50 overflow-hidden shadow-inner"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.1)_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {sortedHotspots.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest">
            Scanning for Hotspots...
          </div>
        ) : (
          sortedHotspots.map((hotspot) => (
            <button
              key={hotspot.id}
              type="button"
              className={`absolute h-2.5 w-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] ring-2 ring-white/50 ${severityStyles[hotspot.severity]}`}
              style={{
                top: `${hotspot.position_y}%`,
                left: `${hotspot.position_x}%`,
                transform: 'translate(-50%, -50%)',
              }}
              onMouseMove={(event) => handleMouseMove(event, hotspot)}
              onMouseLeave={handleMouseLeave}
            />
          ))
        )}

        {tooltip && (
          <div
            className="absolute z-10 max-w-[180px] rounded-xl bg-black/90 px-3 py-2 text-[10px] text-white shadow-2xl backdrop-blur-sm"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-black uppercase tracking-tight mb-0.5">{tooltip.title}</div>
            <div className="text-slate-300 font-medium leading-tight">{tooltip.description}</div>
          </div>
        )}
      </div>
    </div>
  )
}
