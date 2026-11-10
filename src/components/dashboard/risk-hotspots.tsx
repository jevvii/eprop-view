'use client'

import { useRiskHotspots, useAllARAnchors, useAllAIDetections } from '@/app/lib/queries'
import { useRef, useState } from 'react'

const severityStyles: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  moderate: 'bg-amber-400',
  medium: 'bg-amber-400',
  low: 'bg-emerald-500',
}

export function RiskHotspots() {
  const { data: hotspots = [], isLoading, isError } = useRiskHotspots()
  const { data: arAnchors = [] } = useAllARAnchors()
  const { data: aiDetections = [] } = useAllAIDetections()

  const [activeTab, setActiveTab] = useState<'all' | 'hotspots' | 'ar' | 'ai'>('all')
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; subtitle?: string; description: string } | null>(null)

  const handleMouseMove = (event: React.MouseEvent, item: { title: string; subtitle?: string; description: string }) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({
      x: event.clientX - rect.left + 10,
      y: event.clientY - rect.top + 10,
      title: item.title,
      subtitle: item.subtitle,
      description: item.description,
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

  // Derive AR anchors with normalized grid positions
  const mappedARAnchors = (arAnchors || []).map((anchor, idx) => {
    const seed = (anchor?.id || `${idx}`).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + (idx * 17)
    const posX = ((seed * 23) % 76) + 12
    const posY = ((seed * 37) % 74) + 14
    const poseX = anchor?.pose?.position?.x != null ? Number(anchor.pose.position.x).toFixed(1) : '0.0'
    const poseY = anchor?.pose?.position?.y != null ? Number(anchor.pose.position.y).toFixed(1) : '0.0'
    const poseZ = anchor?.pose?.position?.z != null ? Number(anchor.pose.position.z).toFixed(1) : '0.0'

    return {
      id: `ar-${anchor?.id || idx}`,
      type: 'ar' as const,
      title: `AR Anchor: ${anchor?.label || 'Marker'}`,
      subtitle: `${anchor?.damage_type ?? 'structural'} · ${anchor?.severity ?? 'unspecified'}`,
      description: anchor?.notes || `Spatial 3D: [${poseX}, ${poseY}, ${poseZ}]`,
      severity: anchor?.severity ?? 'moderate',
      position_x: posX,
      position_y: posY,
    }
  })

  // Derive AI detections with normalized grid positions
  const mappedAIDetections = (aiDetections || []).map((detection, idx) => {
    const posX = detection?.bbox ? (Number(detection.bbox.x) * 75 + 12) : (((idx * 29 + 11) % 76) + 12)
    const posY = detection?.bbox ? (Number(detection.bbox.y) * 70 + 15) : (((idx * 43 + 19) % 70) + 15)
    const damageType = String(detection?.damage_type || 'defect').toUpperCase()
    const severity = String(detection?.severity || 'moderate').toUpperCase()
    const conf = detection?.confidence != null ? (Number(detection.confidence) * 100).toFixed(0) : '85'
    const score = detection?.severity_score != null ? Number(detection.severity_score).toFixed(0) : '50'

    return {
      id: `ai-${detection?.id || idx}`,
      type: 'ai' as const,
      title: `AI Detection: ${damageType}`,
      subtitle: `${severity} · ${conf}% Conf`,
      description: `Severity: ${score}/100 · ${detection?.notes || 'Automated defect detection'}`,
      severity: detection?.severity ?? 'moderate',
      position_x: posX,
      position_y: posY,
    }
  })

  const mappedHotspots = hotspots.map((h) => ({
    id: `hotspot-${h.id}`,
    type: 'hotspot' as const,
    title: h.title,
    subtitle: `Sector Hotspot · ${h.severity}`,
    description: h.description || 'No description recorded.',
    severity: h.severity,
    position_x: h.position_x,
    position_y: h.position_y,
  }))

  const visibleItems = [
    ...(activeTab === 'all' || activeTab === 'hotspots' ? mappedHotspots : []),
    ...(activeTab === 'all' || activeTab === 'ar' ? mappedARAnchors : []),
    ...(activeTab === 'all' || activeTab === 'ai' ? mappedAIDetections : []),
  ]

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">Sector Hotspots & Telemetry</h3>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-lg transition-colors tabular-nums min-h-[32px] sm:min-h-[36px] ${
              activeTab === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 bg-slate-100/60'
            }`}
          >
            All ({mappedHotspots.length + mappedARAnchors.length + mappedAIDetections.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hotspots')}
            className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-lg transition-colors tabular-nums min-h-[32px] sm:min-h-[36px] ${
              activeTab === 'hotspots' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 bg-slate-100/60'
            }`}
          >
            Hotspots ({mappedHotspots.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ar')}
            className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-lg transition-colors tabular-nums min-h-[32px] sm:min-h-[36px] ${
              activeTab === 'ar' ? 'bg-indigo-600 text-white shadow-xs' : 'text-indigo-600 hover:text-indigo-800 bg-indigo-50/70'
            }`}
          >
            AR ({mappedARAnchors.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            className={`text-xs font-semibold uppercase px-2.5 py-1 rounded-lg transition-colors tabular-nums min-h-[32px] sm:min-h-[36px] ${
              activeTab === 'ai' ? 'bg-blue-600 text-white shadow-xs' : 'text-blue-600 hover:text-blue-800 bg-blue-50/70'
            }`}
          >
            AI ({mappedAIDetections.length})
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-60 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100/50 overflow-hidden shadow-inner"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.1)_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {visibleItems.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest">
            Scanning for Telemetry...
          </div>
        ) : (
          visibleItems.map((item) => {
            const isAR = item.type === 'ar'
            const isAI = item.type === 'ai'

            return (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.title} - ${item.subtitle || ''}`}
                className={`absolute transition-transform hover:scale-150 focus-visible:scale-150 focus-visible:outline-none ${
                  isAR
                    ? 'h-3.5 w-3.5 bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)] ring-2 ring-indigo-200'
                    : isAI
                    ? 'h-3.5 w-3.5 rounded-sm bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)] ring-2 ring-blue-200'
                    : `h-3 w-3 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] ring-2 ring-white/50 ${
                        severityStyles[item.severity] ?? 'bg-amber-400'
                      }`
                }`}
                style={{
                  top: `${item.position_y}%`,
                  left: `${item.position_x}%`,
                  transform: isAR ? 'translate(-50%, -50%) rotate(45deg)' : 'translate(-50%, -50%)',
                }}
                onMouseMove={(event) => handleMouseMove(event, item)}
                onMouseLeave={handleMouseLeave}
                onClick={(event) => handleMouseMove(event, item)}
              />
            )
          })
        )}

        {tooltip && (
          <div
            className="absolute z-10 max-w-[220px] rounded-xl bg-slate-900/95 px-3 py-2 text-xs text-white shadow-2xl backdrop-blur-sm pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-bold uppercase tracking-tight mb-0.5 text-white">{tooltip.title}</div>
            {tooltip.subtitle && (
              <div className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-0.5">{tooltip.subtitle}</div>
            )}
            <div className="text-slate-300 font-medium leading-tight text-xs">{tooltip.description}</div>
          </div>
        )}
      </div>
    </div>
  )
}
