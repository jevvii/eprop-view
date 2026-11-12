'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createReboundTest, getReboundTestsForInspection } from '@/app/actions/structural'
import { REBOUND_CORRELATION_REFERENCE, summarizeReadings } from '@/app/lib/structural/rebound'
import { useStructuralElements } from '@/app/lib/queries'
import type { Inspection, ReboundTest } from '@/app/types'
import { Chip, EmptyState, Field, Panel, formatDate, inputClass, useAsyncAction } from './ui'

/** Parse "40 41, 42  40" into numbers, ignoring anything unparseable. */
function parseReadings(raw: string): number[] {
  return raw
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(Number)
    .filter((value) => Number.isFinite(value))
}

/**
 * Rebound hammer summary.
 *
 * The mean and the estimated strength are computed from the readings, with
 * outliers rejected by the documented IQR rule. The correlation is printed on
 * screen because it is indicative until calibrated for the hammer and concrete
 * on site.
 */
export function ReboundPanel({ inspection }: { inspection: Inspection }) {
  const { data: elements } = useStructuralElements(inspection.floor_id ?? undefined)
  const [tests, setTests] = useState<ReboundTest[]>([])
  const [loading, setLoading] = useState(false)
  const [readings, setReadings] = useState('')
  const [elementId, setElementId] = useState('')
  const [direction, setDirection] = useState<'horizontal' | 'upward' | 'downward' | 'any'>('horizontal')
  const [serial, setSerial] = useState('')
  const [notes, setNotes] = useState('')
  const { pending, error, success, run } = useAsyncAction()

  const parsed = useMemo(() => parseReadings(readings), [readings])
  const preview = useMemo(() => (parsed.length > 0 ? summarizeReadings(parsed) : null), [parsed])
  const invalid = parsed.some((value) => value < 10 || value > 100)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTests(await getReboundTestsForInspection(inspection.id))
    } catch {
      setTests([])
    } finally {
      setLoading(false)
    }
  }, [inspection.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (parsed.length === 0 || invalid) return

    const saved = await run('Rebound test recorded.', () =>
      createReboundTest({
        inspectionId: inspection.id,
        structuralElementId: elementId || null,
        impactDirection: direction,
        instrumentSerial: serial.trim() || null,
        readings: parsed,
        notes: notes.trim(),
      })
    )

    if (saved) {
      setReadings('')
      setNotes('')
      await refresh()
    }
  }

  return (
    <Panel
      title="Rebound Hammer"
      description="Enter each impact reading. Readings that sit outside the interquartile range are rejected before the mean is taken."
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="sm:col-span-2">
          <Field
            label="Impact readings"
            hint="Rebound numbers 10–100, separated by spaces or commas. Ten readings is the usual practice for one test location."
            htmlFor="rebound-readings"
          >
            <textarea
              id="rebound-readings"
              value={readings}
              onChange={(event) => setReadings(event.target.value)}
 className={`${inputClass} min-h-[84px] resize-y`}
              placeholder="40 41 40 42 41 39 40 41 40 42"
            />
          </Field>
          {invalid && (
            <p className="text-xs font-medium text-red-700 mt-1.5">
              Every reading must sit between 10 and 100. Check the values marked outside that range.
            </p>
          )}
        </div>

        <Field label="Structural element" htmlFor="rebound-element">
          <select
            id="rebound-element"
            value={elementId}
            onChange={(event) => setElementId(event.target.value)}
            className={inputClass}
          >
            <option value="">Not specified</option>
            {(elements ?? []).map((element) => (
              <option key={element.id} value={element.id}>
                {element.identifier} · {element.element_type}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Impact direction" htmlFor="rebound-direction">
          <select
            id="rebound-direction"
            value={direction}
            onChange={(event) => setDirection(event.target.value as typeof direction)}
            className={inputClass}
          >
            <option value="horizontal">Horizontal</option>
            <option value="upward">Upward (soffit)</option>
            <option value="downward">Downward (top surface)</option>
            <option value="any">Mixed / not recorded</option>
          </select>
        </Field>

        <Field label="Instrument serial" htmlFor="rebound-serial">
          <input
            id="rebound-serial"
            value={serial}
            onChange={(event) => setSerial(event.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>

        <Field label="Notes" htmlFor="rebound-notes">
          <input
            id="rebound-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={inputClass}
            placeholder="Surface condition, carbonation, moisture"
          />
        </Field>

        {preview && !invalid && (
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">Preview</span>
              <Chip tone="info">{preview.readingsCount} readings</Chip>
              {preview.outlierCount > 0 && <Chip tone="warn">{preview.outlierCount} rejected</Chip>}
              <Chip tone="neutral">Mean R {preview.meanRebound}</Chip>
              <Chip tone="neutral">≈ {preview.estimatedStrengthMpa} MPa</Chip>
            </div>
            <p className="text-[11px] text-slate-600 font-medium leading-relaxed">{REBOUND_CORRELATION_REFERENCE}</p>
            {preview.outlierValues.length > 0 && (
              <p className="text-[11px] text-amber-800 font-medium">
                Rejected as outliers: {preview.outlierValues.join(', ')}
              </p>
            )}
          </div>
        )}

        {error && <div className="sm:col-span-2 text-xs font-medium text-red-700">{error}</div>}
        {success && <div className="sm:col-span-2 text-xs font-medium text-emerald-700">{success}</div>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || parsed.length === 0 || invalid}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {pending ? 'Saving…' : 'Record test'}
          </button>
        </div>
      </form>

      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-[11px] font-bold text-slate-500 mb-2">Recorded tests</h4>
        {loading && <p className="text-xs text-slate-500 font-medium">Loading…</p>}
        {!loading && tests.length === 0 && (
          <EmptyState
            title="No rebound tests yet"
            message="Each recorded test appears here with its reading count, rejected outliers and estimated strength."
          />
        )}
        {!loading && tests.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {tests.map((test) => (
              <li key={test.id} className="py-2.5 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs font-semibold text-slate-700">{formatDate(test.test_date)}</span>
                  <Chip tone="neutral">Mean R {test.mean_rebound ?? '—'}</Chip>
                  <Chip tone="info">≈ {test.estimated_strength_mpa ?? '—'} MPa</Chip>
                  {test.outlier_count > 0 && <Chip tone="warn">{test.outlier_count} rejected</Chip>}
                  <span className="text-[11px] text-slate-500 font-medium">
                    {test.impact_direction}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">{test.correlation_reference}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
