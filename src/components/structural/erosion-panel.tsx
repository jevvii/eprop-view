'use client'

import { useEffect, useState } from 'react'
import { updateInspectionRecord } from '@/app/actions/structural'
import type { ErosionCondition, ErosionType, Inspection } from '@/app/types'
import { Chip, Field, Panel, inputClass, useAsyncAction } from './ui'

const CONDITION_TONE: Record<ErosionCondition, 'good' | 'warn' | 'bad'> = {
  none: 'good',
  minor: 'good',
  moderate: 'warn',
  severe: 'bad',
}

/**
 * Erosion observation.
 *
 * Recorded per inspection because it is a condition seen on a visit. The
 * project-level erosion score lives on the environmental assessment; this feeds
 * it rather than replacing it.
 */
export function ErosionPanel({ inspection }: { inspection: Inspection }) {
  const [condition, setCondition] = useState<ErosionCondition>(
    (inspection.erosion_condition as ErosionCondition) ?? 'none'
  )
  const [type, setType] = useState<ErosionType>((inspection.erosion_type as ErosionType) ?? 'surface')
  const [notes, setNotes] = useState(inspection.erosion_notes ?? '')
  const { pending, error, success, run } = useAsyncAction()

  useEffect(() => {
    setCondition((inspection.erosion_condition as ErosionCondition) ?? 'none')
    setType((inspection.erosion_type as ErosionType) ?? 'surface')
    setNotes(inspection.erosion_notes ?? '')
  }, [inspection.id, inspection.erosion_condition, inspection.erosion_type, inspection.erosion_notes])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await run('Erosion condition saved.', () =>
      updateInspectionRecord({
        inspectionId: inspection.id,
        erosionCondition: condition,
        erosionType: type,
        erosionNotes: notes.trim(),
      })
    )
  }

  return (
    <Panel
      title="Erosion"
      description="Observed on this visit. The project-level erosion score on the environmental assessment stays the summary figure."
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Current</span>
        <Chip tone={CONDITION_TONE[condition]}>{condition}</Chip>
        <span className="text-[11px] uppercase tracking-wide text-slate-500 font-medium">{type}</span>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Field label="Condition" htmlFor="erosion-condition">
          <select
            id="erosion-condition"
            value={condition}
            onChange={(event) => setCondition(event.target.value as ErosionCondition)}
            className={inputClass}
          >
            <option value="none">None observed</option>
            <option value="minor">Minor</option>
            <option value="moderate">Moderate</option>
            <option value="severe">Severe</option>
          </select>
        </Field>

        <Field label="Type" htmlFor="erosion-type">
          <select
            id="erosion-type"
            value={type}
            onChange={(event) => setType(event.target.value as ErosionType)}
            className={inputClass}
          >
            <option value="surface">Surface</option>
            <option value="gully">Gully</option>
            <option value="coastal">Coastal</option>
            <option value="riverbank">Riverbank</option>
            <option value="internal">Internal / under-slab</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Observation notes" htmlFor="erosion-notes">
            <textarea
              id="erosion-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${inputClass} min-h-[84px] resize-y`}
              placeholder="Where the erosion was seen, how much material is exposed, whether water is flowing"
            />
          </Field>
        </div>

        {error && <div className="sm:col-span-2 text-xs font-medium text-red-700">{error}</div>}
        {success && <div className="sm:col-span-2 text-xs font-medium text-emerald-700">{success}</div>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {pending ? 'Saving…' : 'Save observation'}
          </button>
        </div>
      </form>
    </Panel>
  )
}
