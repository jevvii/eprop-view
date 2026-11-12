'use client'

import { useCallback, useEffect, useState } from 'react'
import { createSoilInvestigation, getSoilInvestigations } from '@/app/actions/structural'
import type { Inspection, SoilInvestigation } from '@/app/types'
import { Chip, EmptyState, Field, Panel, formatDate, inputClass, useAsyncAction } from './ui'

const LIQUEFACTION_TONE = {
  none: 'good',
  low: 'good',
  moderate: 'warn',
  high: 'bad',
  unknown: 'neutral',
} as const

/**
 * Soil investigation.
 *
 * Site-level, not per visit: a borehole describes the ground beneath the
 * building, so recording it once against the building is correct. Recording it
 * on every inspection would duplicate the same numbers.
 */
export function SoilPanel({ inspection }: { inspection: Inspection }) {
  const buildingId = inspection.building_id ?? null
  const projectId = inspection.project_id
  const [records, setRecords] = useState<SoilInvestigation[]>([])
  const [loading, setLoading] = useState(false)
  const [borehole, setBorehole] = useState('')
  const [depth, setDepth] = useState('')
  const [classification, setClassification] = useState('')
  const [spt, setSpt] = useState('')
  const [groundwater, setGroundwater] = useState('')
  const [liquefaction, setLiquefaction] = useState<'none' | 'low' | 'moderate' | 'high' | 'unknown'>('unknown')
  const [source, setSource] = useState<'field' | 'laboratory' | 'third_party' | 'desk_study'>('field')
  const [notes, setNotes] = useState('')
  const { pending, error, success, run } = useAsyncAction()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const rows = buildingId
        ? await getSoilInvestigations({ buildingId })
        : await getSoilInvestigations({ projectId })
      setRecords(rows)
    } catch {
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [buildingId, projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!borehole.trim()) return

    const saved = await run('Borehole recorded.', () =>
      createSoilInvestigation({
        buildingId,
        projectId,
        boreholeId: borehole.trim(),
        depthM: depth ? Number(depth) : null,
        soilClassification: classification.trim() || null,
        sptNValue: spt ? Number(spt) : null,
        groundwaterDepthM: groundwater ? Number(groundwater) : null,
        liquefactionSusceptibility: liquefaction,
        source,
        notes: notes.trim(),
      })
    )

    if (saved) {
      setBorehole('')
      setDepth('')
      setClassification('')
      setSpt('')
      setGroundwater('')
      setNotes('')
      await refresh()
    }
  }

  return (
    <Panel
      title="Soil Investigation"
      description="Borehole records describe the ground, so they belong to the site or building rather than to a single visit."
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Field label="Borehole ID" htmlFor="soil-borehole">
          <input
            id="soil-borehole"
            value={borehole}
            onChange={(event) => setBorehole(event.target.value)}
            className={inputClass}
            placeholder="e.g. BH-01"
            required
          />
        </Field>

        <Field label="Depth (m)" htmlFor="soil-depth">
          <input
            id="soil-depth"
            type="number"
            step="0.1"
            min="0"
            value={depth}
            onChange={(event) => setDepth(event.target.value)}
            className={inputClass}
            placeholder="e.g. 6.0"
          />
        </Field>

        <Field label="Soil classification" htmlFor="soil-class">
          <input
            id="soil-class"
            value={classification}
            onChange={(event) => setClassification(event.target.value)}
            className={inputClass}
            placeholder="e.g. Silty clay (CL)"
          />
        </Field>

        <Field label="SPT N-value" htmlFor="soil-spt">
          <input
            id="soil-spt"
            type="number"
            min="0"
            max="200"
            value={spt}
            onChange={(event) => setSpt(event.target.value)}
            className={inputClass}
            placeholder="e.g. 14"
          />
        </Field>

        <Field label="Groundwater depth (m)" htmlFor="soil-gw">
          <input
            id="soil-gw"
            type="number"
            step="0.1"
            min="0"
            value={groundwater}
            onChange={(event) => setGroundwater(event.target.value)}
            className={inputClass}
            placeholder="e.g. 2.4"
          />
        </Field>

        <Field label="Liquefaction susceptibility" htmlFor="soil-liq">
          <select
            id="soil-liq"
            value={liquefaction}
            onChange={(event) => setLiquefaction(event.target.value as typeof liquefaction)}
            className={inputClass}
          >
            <option value="unknown">Unknown</option>
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="moderate">Moderate</option>
            <option value="high">High</option>
          </select>
        </Field>

        <Field label="Source" htmlFor="soil-source">
          <select
            id="soil-source"
            value={source}
            onChange={(event) => setSource(event.target.value as typeof source)}
            className={inputClass}
          >
            <option value="field">Field investigation</option>
            <option value="laboratory">Laboratory</option>
            <option value="third_party">Third-party report</option>
            <option value="desk_study">Desk study</option>
          </select>
        </Field>

        <Field label="Notes" htmlFor="soil-notes">
          <input
            id="soil-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </Field>

        {error && <div className="sm:col-span-2 text-xs font-medium text-red-700">{error}</div>}
        {success && <div className="sm:col-span-2 text-xs font-medium text-emerald-700">{success}</div>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending || !borehole.trim()}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {pending ? 'Saving…' : 'Record borehole'}
          </button>
        </div>
      </form>

      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-[11px] font-bold text-slate-500 mb-2">
          Recorded boreholes
        </h4>
        {loading && <p className="text-xs text-slate-500 font-medium">Loading…</p>}
        {!loading && records.length === 0 && (
          <EmptyState
            title="No boreholes recorded"
            message="Borehole records for this site appear here, with the SPT values and groundwater depth used in the geohazard assessment."
          />
        )}
        {!loading && records.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {records.map((record) => (
              <li key={record.id} className="py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-semibold text-slate-700">{record.borehole_id}</span>
                <span className="text-xs text-slate-600 font-medium">
                  {record.depth_m ?? '—'} m · SPT {record.spt_n_value ?? '—'} · GW {record.groundwater_depth_m ?? '—'} m
                </span>
                <Chip tone={LIQUEFACTION_TONE[record.liquefaction_susceptibility]}>
                  {record.liquefaction_susceptibility}
                </Chip>
                <span className="text-[11px] text-slate-500 font-medium">
                  {formatDate(record.investigation_date)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
