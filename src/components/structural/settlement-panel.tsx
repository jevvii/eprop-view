'use client'

import { useCallback, useEffect, useState } from 'react'
import { recordSettlementObservation, getSettlementObservations } from '@/app/actions/structural'
import {
  SETTLEMENT_LABELS,
  explainSettlement,
  TILT_THRESHOLDS_MM_PER_M,
  DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM,
} from '@/app/lib/structural/settlement'
import type { Inspection, SettlementObservation } from '@/app/types'
import { Chip, EmptyState, Field, Panel, formatDate, inputClass, useAsyncAction } from './ui'

const TONE = {
  none: 'good',
  monitor: 'warn',
  action_required: 'bad',
} as const

/**
 * Tilt and differential settlement.
 *
 * The inspector enters measurements; the classification and the threshold that
 * produced it are computed here for preview and again on the server for the
 * stored value. The server copy is what the record keeps.
 */
export function SettlementPanel({ inspection }: { inspection: Inspection }) {
  const buildingId = inspection.building_id ?? null
  const [observations, setObservations] = useState<SettlementObservation[]>([])
  const [loading, setLoading] = useState(false)
  const [tilt, setTilt] = useState('')
  const [settlement, setSettlement] = useState('')
  const [method, setMethod] = useState<'manual' | 'level' | 'plumb' | 'instrument'>('manual')
  const [notes, setNotes] = useState('')
  const { pending, error, success, run } = useAsyncAction()

  const refresh = useCallback(async () => {
    if (!buildingId) return
    setLoading(true)
    try {
      setObservations(await getSettlementObservations(buildingId))
    } catch {
      setObservations([])
    } finally {
      setLoading(false)
    }
  }, [buildingId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tiltValue = tilt.trim() === '' ? null : Number(tilt)
  const settlementValue = settlement.trim() === '' ? null : Number(settlement)
  const hasInput =
    tiltValue !== null && Number.isFinite(tiltValue) ||
    settlementValue !== null && Number.isFinite(settlementValue)

  const preview = explainSettlement(
    tiltValue !== null && Number.isFinite(tiltValue) ? tiltValue : null,
    settlementValue !== null && Number.isFinite(settlementValue) ? settlementValue : null
  )

  if (!buildingId) {
    return (
      <Panel title="Tilt & Settlement" description="Movement readings are recorded against a building.">
        <EmptyState
          title="No building linked to this inspection"
          message="Link the inspection to a building, floor and structural element first. Movement readings are meaningless without a structure to attach them to."
        />
      </Panel>
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const saved = await run('Movement reading saved.', () =>
      recordSettlementObservation({
        buildingId,
        inspectionId: inspection.id,
        tiltMmPerM: tiltValue !== null && Number.isFinite(tiltValue) ? tiltValue : null,
        differentialSettlementMm:
          settlementValue !== null && Number.isFinite(settlementValue) ? settlementValue : null,
        measurementMethod: method,
        notes: notes.trim(),
      })
    )

    if (saved) {
      setTilt('')
      setSettlement('')
      setNotes('')
      await refresh()
    }
  }

  return (
    <Panel
      title="Tilt & Settlement"
      description="Enter the measured tilt and differential settlement. The classification is computed from documented thresholds, not estimated."
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Field
          label="Tilt (mm per metre)"
          hint={`Monitor above ${TILT_THRESHOLDS_MM_PER_M.monitor} mm/m (1/500); action required above ${TILT_THRESHOLDS_MM_PER_M.action} mm/m (1/250).`}
          htmlFor="settlement-tilt"
        >
          <input
            id="settlement-tilt"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={tilt}
            onChange={(event) => setTilt(event.target.value)}
            className={inputClass}
            placeholder="e.g. 1.8"
          />
        </Field>

        <Field
          label="Differential settlement (mm)"
          hint={`Monitor above ${DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.monitor} mm; action required above ${DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.action} mm.`}
          htmlFor="settlement-diff"
        >
          <input
            id="settlement-diff"
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            value={settlement}
            onChange={(event) => setSettlement(event.target.value)}
            className={inputClass}
            placeholder="e.g. 12"
          />
        </Field>

        <Field label="Measurement method" htmlFor="settlement-method">
          <select
            id="settlement-method"
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
            className={inputClass}
          >
            <option value="manual">Manual</option>
            <option value="level">Engineer&apos;s level</option>
            <option value="plumb">Plumb line</option>
            <option value="instrument">Instrument</option>
          </select>
        </Field>

        <Field label="Notes" htmlFor="settlement-notes">
          <input
            id="settlement-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={inputClass}
            placeholder="Reference points, conditions, observations"
          />
        </Field>

        {hasInput && (
          <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Preview</span>
              <Chip tone={TONE[preview.classification]}>{SETTLEMENT_LABELS[preview.classification]}</Chip>
            </div>
            <ul className="space-y-1">
              {preview.reasons.map((reason) => (
                <li key={reason} className="text-xs text-slate-600 font-medium">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <div className="sm:col-span-2 text-xs font-medium text-red-700">{error}</div>}
        {success && <div className="sm:col-span-2 text-xs font-medium text-emerald-700">{success}</div>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || !hasInput}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {pending ? 'Saving…' : 'Record reading'}
          </button>
        </div>
      </form>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Recorded readings</h4>
        {loading && <p className="text-xs text-slate-500 font-medium">Loading…</p>}
        {!loading && observations.length === 0 && (
          <EmptyState
            title="No movement readings yet"
            message="The first recorded reading appears here with the classification the thresholds produced."
          />
        )}
        {!loading && observations.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {observations.map((observation) => (
              <li key={observation.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-semibold text-slate-700">{formatDate(observation.observed_at)}</span>
                <span className="text-xs text-slate-600 font-medium">
                  Tilt {observation.tilt_mm_per_m ?? '—'} mm/m · Settlement {observation.differential_settlement_mm ?? '—'} mm
                </span>
                <Chip tone={TONE[observation.classification]}>{SETTLEMENT_LABELS[observation.classification]}</Chip>
                <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">
                  {observation.measurement_method}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
