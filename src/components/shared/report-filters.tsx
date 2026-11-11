'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { Report } from '@/app/types'

/**
 * Report filters, kept in the URL.
 *
 * A filtered view must be reproducible from a link, so the state lives in query
 * parameters rather than component state. Selects update immediately; free text
 * is debounced so typing does not push a history entry per keystroke.
 */

export interface ReportFilterState {
  q: string
  status: string
  risk: string
  from: string
  to: string
}

export const EMPTY_FILTERS: ReportFilterState = { q: '', status: 'all', risk: 'all', from: '', to: '' }

const RISK_BANDS: Record<string, [number, number]> = {
  low: [0, 3.99],
  moderate: [4, 6.99],
  high: [7, 8.99],
  critical: [9, 10],
}

export function filterReports(reports: Report[] | undefined, filters: ReportFilterState): Report[] {
  if (!reports) return []

  const query = filters.q.trim().toLowerCase()

  return reports.filter((report) => {
    if (filters.status !== 'all' && report.status !== filters.status) return false

    if (filters.risk !== 'all') {
      const band = RISK_BANDS[filters.risk]
      if (!band) return true
      if (report.risk_score < band[0] || report.risk_score > band[1]) return false
    }

    if (filters.from && report.date < filters.from) return false
    if (filters.to && report.date > filters.to) return false

    if (query) {
      const haystack = [
        report.report_id,
        report.title,
        report.location,
        report.project_name,
        report.key_findings,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query)) return false
    }

    return true
  })
}

/**
 * Read the initial state from the address bar.
 *
 * `useSearchParams` would force every caller into a Suspense boundary during
 * static prerendering. Reading the query string once on the client keeps the
 * same behaviour — a filtered view is still linkable — without that constraint.
 */
function readFromUrl(): ReportFilterState {
  if (typeof window === 'undefined') return EMPTY_FILTERS

  const params = new URLSearchParams(window.location.search)
  return {
    q: params.get('q') ?? '',
    status: params.get('status') ?? 'all',
    risk: params.get('risk') ?? 'all',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  }
}

export function useReportFilters() {
  const router = useRouter()
  const pathname = usePathname()

  const [filters, setFilters] = useState<ReportFilterState>(readFromUrl)

  const syncUrl = useCallback(
    (next: ReportFilterState) => {
      const params = new URLSearchParams()
      if (next.q) params.set('q', next.q)
      if (next.status !== 'all') params.set('status', next.status)
      if (next.risk !== 'all') params.set('risk', next.risk)
      if (next.from) params.set('from', next.from)
      if (next.to) params.set('to', next.to)

      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router]
  )

  const update = useCallback(
    (patch: Partial<ReportFilterState>) => {
      setFilters((current) => ({ ...current, ...patch }))
    },
    []
  )

  // Debounce only the text field.
  useEffect(() => {
    const handle = setTimeout(() => syncUrl(filters), 300)
    return () => clearTimeout(handle)
  }, [filters, syncUrl])

  const reset = useCallback(() => {
    setFilters(EMPTY_FILTERS)
    router.replace(pathname, { scroll: false })
  }, [pathname, router])

  return { filters, update, reset }
}

const controlClass =
  'rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[40px]'

export function ReportFilters({
  filters,
  onChange,
  onReset,
  resultCount,
  children,
}: {
  filters: ReportFilterState
  onChange: (patch: Partial<ReportFilterState>) => void
  onReset: () => void
  resultCount: number
  children?: React.ReactNode
}) {
  const dirty =
    filters.q !== '' || filters.status !== 'all' || filters.risk !== 'all' || filters.from !== '' || filters.to !== ''

  return (
    <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-0 flex-1">
          <label htmlFor="filter-q" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Search
          </label>
          <input
            id="filter-q"
            type="search"
            value={filters.q}
            onChange={(event) => onChange({ q: event.target.value })}
            className={`${controlClass} w-full min-w-[180px]`}
            placeholder="Report ID, title, location, findings"
          />
        </div>

        <div>
          <label htmlFor="filter-status" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Status
          </label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(event) => onChange({ status: event.target.value })}
            className={controlClass}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="in_review">In review</option>
            <option value="critical">Critical</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <div>
          <label htmlFor="filter-risk" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            Risk band
          </label>
          <select
            id="filter-risk"
            value={filters.risk}
            onChange={(event) => onChange({ risk: event.target.value })}
            className={controlClass}
          >
            <option value="all">All</option>
            <option value="low">Low (0–3.9)</option>
            <option value="moderate">Moderate (4–6.9)</option>
            <option value="high">High (7–8.9)</option>
            <option value="critical">Critical (9–10)</option>
          </select>
        </div>

        <div>
          <label htmlFor="filter-from" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            From
          </label>
          <input
            id="filter-from"
            type="date"
            value={filters.from}
            onChange={(event) => onChange({ from: event.target.value })}
            className={controlClass}
          />
        </div>

        <div>
          <label htmlFor="filter-to" className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
            To
          </label>
          <input
            id="filter-to"
            type="date"
            value={filters.to}
            onChange={(event) => onChange({ to: event.target.value })}
            className={controlClass}
          />
        </div>

        {children}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
          {resultCount} {resultCount === 1 ? 'report' : 'reports'} shown
        </p>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] font-bold uppercase tracking-wider text-primary hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}

/** Trigger a browser download for a server-generated file. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
