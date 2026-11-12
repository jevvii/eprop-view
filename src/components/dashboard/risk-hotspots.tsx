'use client'

import { useMemo, useState } from 'react'
import { useRiskHotspots, useAllARAnchors, useAllAIDetections } from '@/app/lib/queries'

type HotspotTab = 'all' | 'hotspots' | 'ar' | 'ai'

interface HotspotItem {
  id: string
  type: 'hotspot' | 'ar' | 'ai'
  title: string
  subtitle: string
  description: string
  severity: string
  position?: { x: number; y: number }
}

const severityDot: Record<string, string> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  moderate: 'bg-severity-moderate',
  medium: 'bg-severity-moderate',
  low: 'bg-severity-low',
}

function normalizeSeverity(severity: string): string {
  return severity === 'medium' ? 'moderate' : severity
}

export function RiskHotspots() {
  const { data: hotspots = [], isLoading, isError, refetch } = useRiskHotspots()
  const { data: arAnchors = [] } = useAllARAnchors()
  const { data: aiDetections = [] } = useAllAIDetections()

  const [activeTab, setActiveTab] = useState<HotspotTab>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const items = useMemo<HotspotItem[]>(() => {
    const mappedHotspots: HotspotItem[] = hotspots.map((hotspot) => ({
      id: `hotspot-${hotspot.id}`,
      type: 'hotspot',
      title: hotspot.title,
      subtitle: `Hotspot · ${normalizeSeverity(hotspot.severity)}`,
      description: hotspot.description || 'No description recorded.',
      severity: normalizeSeverity(hotspot.severity),
      position: { x: hotspot.position_x, y: hotspot.position_y },
    }))

    // These records have no map coordinates. They are listed, never plotted at
    // hash-derived positions pretending to be spatial data.
    const mappedAnchors: HotspotItem[] = arAnchors.map((anchor, index) => ({
      id: `ar-${anchor.id || index}`,
      type: 'ar',
      title: anchor.label || 'AR marker',
      subtitle: `${anchor.damage_type ?? 'unclassified'} · ${anchor.severity ?? 'no severity'}`,
      description: anchor.notes || 'Screen-space marker. No map coordinates recorded.',
      severity: normalizeSeverity(anchor.severity ?? 'moderate'),
    }))

    const mappedDetections: HotspotItem[] = aiDetections.map((detection, index) => ({
      id: `ai-${detection.id || index}`,
      type: 'ai',
      title: `${String(detection.damage_type).toUpperCase()} detection`,
      subtitle: `${normalizeSeverity(detection.severity)} · ${(detection.confidence * 100).toFixed(0)}% confidence`,
      description: `Severity ${detection.severity_score.toFixed(0)}/100. ${detection.notes ?? ''}`.trim(),
      severity: normalizeSeverity(detection.severity),
    }))

    return [...mappedHotspots, ...mappedAnchors, ...mappedDetections]
  }, [hotspots, arAnchors, aiDetections])

  const counts = useMemo(
    () => ({
      all: items.length,
      hotspots: items.filter((item) => item.type === 'hotspot').length,
      ar: items.filter((item) => item.type === 'ar').length,
      ai: items.filter((item) => item.type === 'ai').length,
    }),
    [items]
  )

  const visibleItems = items.filter((item) => activeTab === 'all' || item.type === activeTab)
  const selected = items.find((item) => item.id === selectedId) ?? null

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm animate-pulse h-64 border border-slate-200" aria-busy="true" />
    )
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200" role="alert">
        <h3 className="text-sm font-bold text-slate-900">Sector hotspots</h3>
        <p className="mt-1 text-sm text-red-700">Unable to load hotspot data.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-3 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 min-h-[36px]"
        >
          Retry
        </button>
      </div>
    )
  }

  const tabs: { key: HotspotTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'hotspots', label: 'Hotspots' },
    { key: 'ar', label: 'AR' },
    { key: 'ai', label: 'AI' },
  ]

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Sector hotspots</h3>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter hotspots">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
 className={`min-h-[36px] rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors ${
                activeTab === tab.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label} ({counts[tab.key]})
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-56 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
        <div
          className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:24px_24px]"
          aria-hidden="true"
        />

        {visibleItems.filter((item) => item.position).length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-slate-700">No mapped hotspots</p>
            <p className="mt-1 text-sm text-slate-500">
              Only records with coordinates are plotted. AR markers and image detections are listed below.
            </p>
          </div>
        ) : (
          visibleItems.map((item) => {
            if (!item.position) return null
            const isSelected = item.id === selectedId
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.title}. ${item.subtitle}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(isSelected ? null : item.id)}
                className="absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={{ top: `${item.position.y}%`, left: `${item.position.x}%` }}
              >
                <span
 className={`block h-3 w-3 rounded-full ring-2 ring-white ${
                    severityDot[item.severity] ?? 'bg-slate-500'
                  } ${isSelected ? 'scale-150' : ''}`}
                  aria-hidden="true"
                />
              </button>
            )
          })
        )}
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-3" role="status">
          <p className="text-sm font-semibold text-slate-900">{selected.title}</p>
          <p className="text-xs font-medium text-slate-500">{selected.subtitle}</p>
          <p className="mt-1 text-sm text-slate-600">{selected.description}</p>
        </div>
      )}

      {visibleItems.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          No records in this filter.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id === selectedId ? null : item.id)}
                aria-pressed={item.id === selectedId}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-slate-50 min-h-[44px]"
              >
                <span
 className={`h-2.5 w-2.5 shrink-0 rounded-full ${severityDot[item.severity] ?? 'bg-slate-500'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-800">{item.title}</span>
                  <span className="block truncate text-xs text-slate-500">{item.subtitle}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{item.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
