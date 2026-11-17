'use client'

import type { DamageType, ImageAnnotation, SeverityLevel } from '@/app/types'
import { canEditAnnotation } from '@/app/lib/annotation/lifecycle'

const DAMAGE_TYPES: { id: DamageType; label: string }[] = [
  { id: 'crack', label: 'Crack' },
  { id: 'corrosion', label: 'Corrosion' },
  { id: 'spalling', label: 'Spalling' },
  { id: 'deformation', label: 'Deformation' },
  { id: 'leakage', label: 'Leakage' },
]

const SEVERITIES: { id: SeverityLevel; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
]

const inputClass =
  'w-full rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-sm font-medium text-[#111] outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]'

export function AnnotationSidebar({
  annotations,
  selected,
  onSelect,
  onUpdate,
  onDelete,
  onNoFindings,
  onApprove,
  onReject,
  canReview,
  scaleKnown,
  gsdMmPerPx,
}: {
  annotations: ImageAnnotation[]
  selected: ImageAnnotation | null
  onSelect: (id: string) => void
  onUpdate: (id: string, patch: Record<string, unknown>) => void
  onDelete: (id: string) => void
  onNoFindings: () => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  canReview: boolean
  scaleKnown: boolean
  gsdMmPerPx: number | null
}) {
  return (
    <aside className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Findings ({annotations.length})
        </h2>
        <button
          type="button"
          onClick={onNoFindings}
          className="rounded-lg border border-[#EAEAEA] px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 min-h-[44px]"
        >
          No findings
        </button>
      </div>

      <ul className="space-y-1.5">
        {annotations.map((annotation, index) => (
          <li key={annotation.id}>
            <button
              type="button"
              onClick={() => onSelect(annotation.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
                selected?.id === annotation.id
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-[#EAEAEA] bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="tabular-nums">{index + 1}.</span>{' '}
              {annotation.damage_type === 'none' ? 'No damage' : annotation.damage_type}
              {annotation.severity ? ` · ${annotation.severity}` : ''}
              {annotation.status !== 'draft' && (
                <span className="ml-1 text-[10px] uppercase text-slate-400">{annotation.status}</span>
              )}
            </button>
          </li>
        ))}
        {annotations.length === 0 && (
          <li className="rounded-lg border border-dashed border-[#EAEAEA] p-3 text-xs font-medium text-slate-500">
            Nothing marked yet. Draw a box or polygon, or confirm there is no damage.
          </li>
        )}
      </ul>

      {selected && selected.geometry_kind !== 'none' && (
        <section className="space-y-3 rounded-lg border border-[#EAEAEA] p-3">
          {!canEditAnnotation(selected.status) && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">
              This finding has been reviewed and is frozen. Approve or reject decisions cannot be undone.
            </p>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500" htmlFor="annotation-damage">
              Defect
            </label>
            <select
              id="annotation-damage"
              className={inputClass}
              value={selected.damage_type}
              disabled={!canEditAnnotation(selected.status)}
              onChange={(event) => onUpdate(selected.id, { damageType: event.target.value })}
            >
              {DAMAGE_TYPES.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500" htmlFor="annotation-severity">
              Severity
            </label>
            <select
              id="annotation-severity"
              className={inputClass}
              value={selected.severity ?? 'low'}
              disabled={!canEditAnnotation(selected.status)}
              onChange={(event) => onUpdate(selected.id, { severity: event.target.value })}
            >
              {SEVERITIES.map((level) => (
                <option key={level.id} value={level.id}>{level.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500" htmlFor="annotation-width">
              Crack width (mm)
            </label>
            <input
              id="annotation-width"
              type="number"
              step="0.1"
              min={0}
              disabled={!scaleKnown || !canEditAnnotation(selected.status)}
              className={inputClass}
              value={selected.crack_width_mm ?? ''}
              placeholder={scaleKnown ? (selected.measured_width_px ? 'Derived from ruler' : 'Optional') : 'Scale unknown'}
              onChange={(event) => {
                const parsed = Number(event.target.value)
                onUpdate(selected.id, {
                  crackWidthMm: event.target.value === '' || Number.isNaN(parsed) ? null : parsed,
                })
              }}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-slate-500" htmlFor="annotation-notes">
              Notes
            </label>
            <textarea
              id="annotation-notes"
              rows={2}
              className={`${inputClass} min-h-[72px]`}
              value={selected.notes}
              disabled={!canEditAnnotation(selected.status)}
              onChange={(event) => onUpdate(selected.id, { notes: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {canReview && selected.status === 'submitted' && (
              <>
                <button
                  type="button"
                  onClick={() => onApprove(selected.id)}
                  className="min-h-[44px] rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onReject(selected.id)}
                  className="min-h-[44px] rounded-lg border border-[#EAEAEA] px-3 text-xs font-bold text-slate-700"
                >
                  Reject
                </button>
              </>
            )}
            {(selected.status === 'draft' || selected.status === 'submitted') && (
              <button
                type="button"
                onClick={() => onDelete(selected.id)}
                className="min-h-[44px] rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600"
              >
                Delete
              </button>
            )}
          </div>

          {!scaleKnown && (
            <p className="text-[11px] font-medium text-amber-700">
              This image has no known scale (gsd). Widths stay in pixels and cannot export in millimetres
              {gsdMmPerPx !== null ? ` (${gsdMmPerPx} mm/px)` : ''}.
            </p>
          )}
        </section>
      )}
    </aside>
  )
}
