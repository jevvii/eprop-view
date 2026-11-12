'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check, Filter, Search, X } from 'lucide-react'
import { getWorkspaceFilterOptions } from '@/app/actions/filters'
import {
  EMPTY_WORKSPACE_FILTERS,
  filterSchema,
  filterSearch,
  parseFilterSearch,
  type WorkspaceFilters,
} from '@/app/lib/workspace-filters'
import { REPORT_FILTER_FIELDS } from '@/app/lib/workspace-filtering'

export type ReportFilterState = WorkspaceFilters
export const EMPTY_FILTERS = EMPTY_WORKSPACE_FILTERS
export { filterReports } from '@/app/lib/workspace-filtering'

const Context = createContext<{
  filters: WorkspaceFilters
  update: (patch: Partial<WorkspaceFilters>) => void
  reset: () => void
}>({ filters: EMPTY_FILTERS, update: () => {}, reset: () => {} })

export function WorkspaceFiltersProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [filters, setFilters] = useState<WorkspaceFilters>(EMPTY_FILTERS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const sync = () => {
      setFilters(parseFilterSearch(window.location.search))
      setReady(true)
    }
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [pathname])

  // The URL keeps the view shareable. It is written after the UI has updated and
  // no longer triggers a data fetch: reads do not depend on it any more.
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      const q = filterSearch(filters, window.location.search)
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
    }, 250)
    return () => clearTimeout(timer)
  }, [filters, pathname, ready, router])

  const update = (patch: Partial<WorkspaceFilters>) =>
    setFilters((current) => ({ ...current, ...patch }))
  const reset = () => setFilters({ ...EMPTY_FILTERS })

  return (
    <Context.Provider value={{ filters, update, reset }}>{children}</Context.Provider>
  )
}

export function useReportFilters() {
  return useContext(Context)
}

export const useWorkspaceFilters = useReportFilters

type Options = Awaited<ReturnType<typeof getWorkspaceFilterOptions>>
type FieldKey = keyof WorkspaceFilters

interface FieldOption {
  value: string
  label: string
  tone?: string
}

interface FieldDef {
  key: FieldKey
  label: string
  kind: 'options' | 'date'
  options?: FieldOption[]
}

const control =
  'h-10 rounded-md border border-slate-300 bg-white px-3 text-sm min-w-0 focus-visible:outline-2 focus-visible:outline-primary'

const humanise = (value: string) => value.replaceAll('_', ' ')

/** Muted pastels only; colour is a label signal, never decoration. */
const TONES: Record<string, string> = {
  open: 'bg-[#E1F3FE] text-[#1F6C9F]',
  in_review: 'bg-[#FBF3DB] text-[#956400]',
  critical: 'bg-[#FDEBEC] text-[#9F2F2D]',
  completed: 'bg-[#EDF3EC] text-[#346538]',
  pending: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-[#E1F3FE] text-[#1F6C9F]',
  requires_followup: 'bg-[#FBF3DB] text-[#956400]',
  deferred: 'bg-slate-100 text-slate-700',
  low: 'bg-[#EDF3EC] text-[#346538]',
  moderate: 'bg-[#FBF3DB] text-[#956400]',
  high: 'bg-[#FFEDD5] text-[#C2410C]',
  medium: 'bg-[#FBF3DB] text-[#956400]',
  verified: 'bg-[#EDF3EC] text-[#346538]',
  unverified: 'bg-slate-100 text-slate-700',
}

const DEFAULTS: Record<FieldKey, string> = {
  q: '',
  status: 'all',
  risk: 'all',
  severity: 'all',
  damage: 'all',
  crack: 'all',
  building: '',
  floor: '',
  element: '',
  from: '',
  to: '',
  verification: 'all',
}

function buildFields(options: Options, filters: WorkspaceFilters, visible?: FieldKey[]): FieldDef[] {
  const all: FieldDef[] = [
    {
      key: 'status',
      label: 'Status',
      kind: 'options',
      options: [
        { value: 'all', label: 'All statuses' },
        ...['open', 'in_review', 'critical', 'completed', 'pending', 'in_progress', 'requires_followup', 'deferred'].map(
          (value) => ({ value, label: humanise(value), tone: TONES[value] })
        ),
      ],
    },
    {
      key: 'risk',
      label: 'Risk band',
      kind: 'options',
      options: [
        { value: 'all', label: 'All risk bands' },
        { value: 'low', label: 'Low (<4)', tone: TONES.low },
        { value: 'moderate', label: 'Moderate (4–<6)', tone: TONES.moderate },
        { value: 'high', label: 'High (6–<8)', tone: TONES.high },
        { value: 'critical', label: 'Critical (8–10)', tone: TONES.critical },
      ],
    },
    {
      key: 'severity',
      label: 'Detection severity',
      kind: 'options',
      options: [
        { value: 'all', label: 'All severities' },
        ...['low', 'medium', 'high', 'critical'].map((value) => ({
          value,
          label: value,
          tone: TONES[value],
        })),
      ],
    },
    {
      key: 'damage',
      label: 'Damage type',
      kind: 'options',
      options: [
        { value: 'all', label: 'All damage types' },
        ...['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none'].map((value) => ({
          value,
          label: value,
        })),
      ],
    },
    {
      key: 'crack',
      label: 'Crack band',
      kind: 'options',
      options: [
        { value: 'all', label: 'All crack bands' },
        ...['hairline', 'fine', 'medium', 'wide', 'severe'].map((value) => ({ value, label: value })),
      ],
    },
    {
      key: 'building',
      label: 'Building',
      kind: 'options',
      options: [
        { value: '', label: 'All buildings' },
        ...options.buildings.map((x) => ({ value: x.id, label: x.name })),
      ],
    },
    {
      key: 'floor',
      label: 'Floor',
      kind: 'options',
      options: [
        { value: '', label: 'All floors' },
        ...options.floors
          .filter((x) => !filters.building || x.building_id === filters.building)
          .map((x) => ({ value: x.id, label: x.name })),
      ],
    },
    {
      key: 'element',
      label: 'Element',
      kind: 'options',
      options: [
        { value: '', label: 'All elements' },
        ...options.elements
          .filter((x) => !filters.floor || x.floor_id === filters.floor)
          .map((x) => ({ value: x.id, label: x.identifier })),
      ],
    },
    {
      key: 'verification',
      label: 'Verification',
      kind: 'options',
      options: [
        { value: 'all', label: 'Any verification' },
        { value: 'verified', label: 'Engineer verified', tone: TONES.verified },
        { value: 'unverified', label: 'Awaiting verification', tone: TONES.unverified },
      ],
    },
    { key: 'from', label: 'From date', kind: 'date' },
    { key: 'to', label: 'To date', kind: 'date' },
  ]

  return visible ? all.filter((field) => visible.includes(field.key)) : all
}

export function ReportFilters({
  filters,
  onChange,
  onReset,
  resultCount,
  fields: visibleFields,
  initialOptions,
}: {
  filters: WorkspaceFilters
  onChange: (patch: Partial<WorkspaceFilters>) => void
  onReset: () => void
  resultCount?: number
  fields?: FieldKey[]
  /** Pre-loaded option lists; skips the server fetch (used by tests and embeds). */
  initialOptions?: Options
}) {
  const [options, setOptions] = useState<Options>(
    initialOptions ?? { buildings: [], floors: [], elements: [] }
  )
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [activeKey, setActiveKey] = useState<FieldKey>('status')
  const [optionQuery, setOptionQuery] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialOptions) return
    let cancelled = false
    getWorkspaceFilterOptions()
      .then((value) => {
        if (!cancelled) setOptions(value)
      })
      .catch(() => {
        if (!cancelled) setError('Filter options could not be loaded.')
      })
    return () => {
      cancelled = true
    }
  }, [initialOptions])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open])

  const fields = buildFields(options, filters, visibleFields ?? REPORT_FILTER_FIELDS)
  const active = fields.find((field) => field.key === activeKey) ?? fields[0]

  const keys = Object.keys(DEFAULTS) as FieldKey[]
  const activeCount = keys.filter((key) => filters[key] !== DEFAULTS[key]).length

  const selectedLabel = (key: FieldKey): string | null => {
    const value = filters[key]
    if (!value || value === 'all') return null
    const field = buildFields(options, filters, [key])[0]
    const option = field?.options?.find((x) => x.value === value)
    return option?.label ?? value
  }

  const chips = fields
    .map((field) => {
      const label = selectedLabel(field.key)
      return label ? { key: field.key, label: `${field.label}: ${label}` } : null
    })
    .filter(Boolean) as { key: FieldKey; label: string }[]

  if (filters.q) {
    chips.unshift({ key: 'q', label: `Search: “${filters.q}”` })
  }

  const clearField = (key: FieldKey) => {
    const patch: Partial<WorkspaceFilters> = {
      [key]: DEFAULTS[key],
    } as Partial<WorkspaceFilters>
    if (key === 'building') {
      patch.floor = ''
      patch.element = ''
    }
    if (key === 'floor') patch.element = ''
    onChange(patch)
  }

  const filteredOptions = (active?.options ?? []).filter((option) =>
    option.label.toLowerCase().includes(optionQuery.trim().toLowerCase())
  )

  return (
    <div ref={wrapperRef} className="no-print relative">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search records"
            placeholder="Search records…"
 className={`${control} w-full pl-9`}
            value={filters.q}
            onChange={(event) => onChange({ q: event.target.value })}
          />
        </div>

        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
 className={`${control} inline-flex w-auto items-center gap-1.5 font-semibold ${
            activeCount > 0 ? 'border-primary/40 text-primary' : 'text-slate-700'
          }`}
        >
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filter
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-white">
              {activeCount}
            </span>
          )}
        </button>

        {chips.length > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        )}

        {resultCount !== undefined && (
          <p className="ml-auto text-xs font-medium text-slate-600">
            {resultCount} {resultCount === 1 ? 'record' : 'records'}
          </p>
        )}
      </div>

      {chips.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => clearField(chip.key)}
                aria-label={`Remove filter: ${chip.label}`}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {chip.label}
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Filter records"
          className="absolute left-0 top-full z-30 mt-2 w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr]">
            <ul className="border-b border-slate-200 p-2 sm:border-b-0 sm:border-r">
              {fields.map((field) => {
                const isActive = field.key === active?.key
                const selected = selectedLabel(field.key)
                return (
                  <li key={field.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveKey(field.key)
                        setOptionQuery('')
                      }}
                      aria-current={isActive ? 'true' : undefined}
 className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                        isActive
                          ? 'bg-[#E1F3FE] font-semibold text-[#1F6C9F]'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{field.label}</span>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="p-3">
              {active?.kind === 'options' ? (
                <>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label={`Search ${active.label}`}
                      placeholder={`Search ${active.label.toLowerCase()}`}
                      value={optionQuery}
                      onChange={(event) => setOptionQuery(event.target.value)}
 className={`${control} w-full pl-8 text-sm`}
                    />
                  </div>

                  <ul className="mt-2 max-h-64 overflow-y-auto">
                    {filteredOptions.map((option) => {
                      const checked = filters[active.key] === option.value
                      return (
                        <li key={option.value || 'all'}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() =>
                              onChange({ [active.key]: option.value } as Partial<WorkspaceFilters>)
                            }
                            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-50"
                          >
                            <span
                              aria-hidden="true"
 className={`flex h-4 w-4 items-center justify-center rounded border ${
                                checked
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {checked && <Check className="h-3 w-3" />}
                            </span>
                            {option.tone ? (
 <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${option.tone}`}>
                                {option.label}
                              </span>
                            ) : (
                              <span className="text-slate-700">{option.label}</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                    {filteredOptions.length === 0 && (
                      <li className="px-2 py-3 text-xs text-slate-600">No values match.</li>
                    )}
                  </ul>
                </>
              ) : (
                <label className="block text-sm">
                  <span className="text-slate-700">{active?.label}</span>
                  <input
                    type="date"
 className={`${control} mt-2 w-full`}
                    value={active ? filters[active.key] : ''}
                    onChange={(event) =>
                      active &&
                      onChange({ [active.key]: event.target.value } as Partial<WorkspaceFilters>)
                    }
                  />
                </label>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
            <button
              type="button"
              onClick={onReset}
              disabled={activeCount === 0}
              className="text-xs font-semibold text-slate-600 hover:underline disabled:opacity-40"
            >
              Clear all
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => active && clearField(active.key)}
                disabled={!active || !selectedLabel(active.key)}
                className="text-xs font-semibold text-slate-600 hover:underline disabled:opacity-40"
              >
                Clear
              </button>
              <span className="text-xs tabular-nums text-slate-600">
                {filteredOptions.length} of {(active?.options ?? []).length}
              </span>
              <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 sm:inline">
                Esc
              </kbd>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function WorkspaceFilterBar({ fields }: { fields?: FieldKey[] } = {}) {
  const value = useWorkspaceFilters()
  return (
    <ReportFilters
      filters={value.filters}
      onChange={value.update}
      onReset={value.reset}
      fields={fields}
    />
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
