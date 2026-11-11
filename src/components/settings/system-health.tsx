'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/app/lib/supabase/client'
import { Chip, EmptyState, Panel } from '@/components/structural/ui'

interface HealthCounts {
  projects: number
  inspections: number
  reports: number
  images: number
  detections: number
  failedJobs: number
  openMaintenance: number
  storageObjects: number
}

type CountKey = keyof HealthCounts

/**
 * System health.
 *
 * Real numbers only. Every figure is a counted row; nothing here is estimated or
 * extrapolated, and a failed query renders as "unavailable" rather than zero.
 */
export function SystemHealth() {
  const [counts, setCounts] = useState<Partial<HealthCounts>>({})
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    const countOf = async (table: string, filter?: { column: string; value: string }) => {
      let query = supabase.from(table).select('id', { count: 'exact', head: true })
      if (filter) query = query.eq(filter.column, filter.value)
      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    }

    const load = async () => {
      try {
        const [
          projects,
          inspections,
          reports,
          images,
          detections,
          failedJobs,
          openMaintenance,
          storageObjects,
        ] = await Promise.all([
          countOf('projects'),
          countOf('inspections'),
          countOf('reports'),
          countOf('inspection_images'),
          countOf('ai_damage_detections'),
          countOf('ai_analysis_jobs', { column: 'status', value: 'failed' }),
          countOf('maintenance_priorities', { column: 'status', value: 'pending' }),
          countOf('storage_audit'),
        ])

        if (!cancelled) {
          setCounts({
            projects,
            inspections,
            reports,
            images,
            detections,
            failedJobs,
            openMaintenance,
            storageObjects,
          })
        }
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const rows: { key: CountKey; label: string; tone?: 'good' | 'warn' | 'bad' }[] = [
    { key: 'projects', label: 'Projects' },
    { key: 'inspections', label: 'Inspections' },
    { key: 'reports', label: 'Reports' },
    { key: 'images', label: 'Stored images' },
    { key: 'detections', label: 'AI detections' },
    { key: 'failedJobs', label: 'Failed AI jobs', tone: 'bad' },
    { key: 'openMaintenance', label: 'Maintenance pending', tone: 'warn' },
    { key: 'storageObjects', label: 'Objects in storage audit', tone: 'good' },
  ]

  return (
    <Panel title="System Health" description="Counted from the database on load. A figure that could not be read says unavailable rather than zero.">
      {loading && <p className="text-xs text-slate-500 font-medium">Counting…</p>}

      {!loading && failed && (
        <EmptyState
          title="Health check unavailable"
          message="The counts could not be read for this role or connection. Nothing is shown rather than a misleading zero."
        />
      )}

      {!loading && !failed && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {rows.map((row) => (
            <div key={row.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{row.label}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {counts[row.key] ?? '—'}
              </p>
              {row.tone && counts[row.key] != null && counts[row.key]! > 0 && (
                <Chip tone={row.tone}>{row.tone === 'bad' ? 'needs attention' : row.tone === 'warn' ? 'open' : 'ok'}</Chip>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
