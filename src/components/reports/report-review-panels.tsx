'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  confirmCostEstimate,
  createRecommendation,
  getCostEstimates,
  getRecommendationDraftContext,
  getRecommendations,
  saveCostEstimate,
  signRecommendation,
} from '@/app/actions/reports-v2'
import { draftRecommendation, suggestRepairCost } from '@/app/actions/gemini-analysis'
import { updateDetectionCrackTaxonomy } from '@/app/actions/structural'
import { getDetectionsForInspection } from '@/app/actions/ai'
import { formatPhp, tableEstimate } from '@/app/lib/structural/cost-table'
import {
  CAUSE_LABELS,
  ORIENTATION_LABELS,
  PATTERN_LABELS,
} from '@/app/lib/structural/crack-taxonomy'
import type {
  AIDamageDetection,
  CostEstimate,
  CrackCause,
  CrackOrientation,
  CrackPattern,
  DamageType,
  Recommendation,
  Report,
  SeverityLevel,
  StructuralElement,
} from '@/app/types'
import { Chip, EmptyState, Field, InlineMessage, Panel, formatDate, inputClass, textareaClass, useAsyncAction } from '@/components/structural/ui'

const DAMAGE_TYPES: DamageType[] = ['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']
const SEVERITIES: SeverityLevel[] = ['low', 'medium', 'high', 'critical']
const ELEMENTS: StructuralElement[] = ['beam', 'column', 'slab', 'wall', 'foundation', 'facade', 'roof', 'general', 'other']

/**
 * Cost and action.
 *
 * The AI range and the deterministic table are shown side by side on purpose.
 * When they disagree beyond the accepted band the panel refuses to treat the
 * figure as agreed until an engineer writes down why.
 */
export function CostPanel({ report }: { report: Report }) {
  const [damageType, setDamageType] = useState<DamageType>('crack')
  const [severity, setSeverity] = useState<SeverityLevel>('medium')
  const [element, setElement] = useState<StructuralElement>('general')
  const [context, setContext] = useState('')
  const [estimates, setEstimates] = useState<CostEstimate[]>([])
  const [suggestion, setSuggestion] = useState<Awaited<ReturnType<typeof suggestRepairCost>> | null>(null)
  const [reason, setReason] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const { pending, error, success, run } = useAsyncAction()

  const refresh = useCallback(async () => {
    if (!report.inspection_id) return
    try {
      setEstimates(await getCostEstimates({ inspectionId: report.inspection_id }))
    } catch {
      setEstimates([])
    }
  }, [report.inspection_id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const tableValue = tableEstimate(damageType, severity, element)

  const handleSuggest = async () => {
    const result = await run('AI estimate generated.', () =>
      suggestRepairCost({ damageType, severity, elementType: element, context: context.trim() })
    )
    if (result) setSuggestion(result)
  }

  const handleSave = async () => {
    const saved = await run('Cost estimate saved.', () =>
      saveCostEstimate({
        inspectionId: report.inspection_id,
        reportId: report.id,
        damageType,
        severity,
        elementType: element,
        aiLowPhp: suggestion?.aiLowPhp ?? null,
        aiLikelyPhp: suggestion?.aiLikelyPhp ?? null,
        aiHighPhp: suggestion?.aiHighPhp ?? null,
        aiBasis: suggestion?.basis ?? null,
        aiConfidence: suggestion?.confidence ?? null,
      })
    )

    if (saved) {
      setSelectedId(saved.id)
      await refresh()
    }
  }

  const handleConfirm = async (id: string) => {
    const confirmed = await run('Estimate confirmed.', () => confirmCostEstimate(id, reason.trim()))
    if (confirmed) {
      setReason('')
      await refresh()
    }
  }

  return (
    <Panel
      title="Repair Cost & Action"
      description="Planning-level figures only. The table value is computed; the AI range is advisory and must agree or be justified."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Defect" htmlFor="cost-damage">
          <select id="cost-damage" value={damageType} onChange={(event) => setDamageType(event.target.value as DamageType)} className={inputClass}>
            {DAMAGE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Severity" htmlFor="cost-severity">
          <select id="cost-severity" value={severity} onChange={(event) => setSeverity(event.target.value as SeverityLevel)} className={inputClass}>
            {SEVERITIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Element" htmlFor="cost-element">
          <select id="cost-element" value={element} onChange={(event) => setElement(event.target.value as StructuralElement)} className={inputClass}>
            {ELEMENTS.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Site context (optional)" htmlFor="cost-context">
        <input
          id="cost-context"
          value={context}
          onChange={(event) => setContext(event.target.value)}
          className={inputClass}
          placeholder="Access constraints, heritage structure, occupied building"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[11px] font-bold text-slate-500">Deterministic table</p>
          <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatPhp(tableValue)}</p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">Damage type × severity × element multiplier.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
          <p className="text-[11px] font-bold text-slate-500">AI-assisted estimate</p>
          {suggestion?.aiLikelyPhp != null ? (
            <>
              <p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{formatPhp(suggestion.aiLikelyPhp)}</p>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                Range {formatPhp(suggestion.aiLowPhp)} – {formatPhp(suggestion.aiHighPhp)} · confidence {Math.round((suggestion.confidence ?? 0) * 100)}%
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500 font-medium mt-2">
              {suggestion?.fallbackReason ? 'AI unavailable — table value applies.' : 'Not requested yet.'}
            </p>
          )}
        </div>
      </div>

      {suggestion?.divergenceFlag && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
          <p className="text-xs font-bold text-amber-900">Divergence flagged</p>
          <p className="text-xs text-amber-900 font-medium mt-1">{suggestion.divergenceReason}</p>
          <p className="text-[11px] text-amber-900/80 font-medium mt-1">
            An engineer must confirm the figure and state why before it is treated as agreed.
          </p>
        </div>
      )}

      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {success && <InlineMessage tone="success">{success}</InlineMessage>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSuggest}
          disabled={pending}
          className="inline-flex items-center justify-center bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 min-h-[44px]"
        >
          {pending ? 'Working…' : 'Ask AI for a range'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || damageType === 'none'}
          className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
        >
          Save estimate
        </button>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-[11px] font-bold text-slate-500 mb-2">Estimates on this inspection</h4>
        {estimates.length === 0 ? (
          <EmptyState title="No cost estimate yet" message="A saved estimate shows the table value, the AI range and its confirmation state." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {estimates.map((estimate) => (
              <li key={estimate.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">{formatPhp(estimate.table_estimate_php)}</span>
                  {estimate.ai_likely_php != null && (
                    <Chip tone="info">AI {formatPhp(estimate.ai_likely_php)}</Chip>
                  )}
                  {estimate.divergence_flag && <Chip tone="warn">Divergent</Chip>}
                  <Chip tone={estimate.confirmed_at ? 'good' : 'neutral'}>
                    {estimate.confirmed_at ? 'Confirmed' : 'Unconfirmed'}
                  </Chip>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {estimate.provenance} · {formatDate(estimate.created_at)}
                  </span>
                </div>
                {estimate.ai_basis && <p className="text-[11px] text-slate-600 font-medium">{estimate.ai_basis}</p>}
                {estimate.divergence_flag && !estimate.confirmed_at && (
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      aria-label="Reason for confirming this estimate"
                      value={selectedId === estimate.id ? reason : ''}
                      onChange={(event) => { setSelectedId(estimate.id); setReason(event.target.value) }}
 className={`${inputClass} max-w-[320px]`}
                      placeholder="Why the AI figure is credible despite the divergence"
                    />
                    <button
                      type="button"
                      onClick={() => handleConfirm(estimate.id)}
                      disabled={pending || selectedId !== estimate.id || reason.trim().length < 10}
                      className="inline-flex items-center justify-center bg-amber-600 text-white text-[11px] font-bold px-4 py-2.5 rounded-xl hover:bg-amber-700 transition-all disabled:opacity-40 min-h-[44px]"
                    >
                      Confirm with reason
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

/**
 * Recommendations: AI drafts, an engineer signs.
 *
 * The signature is the boundary. A draft is editable text with no authority; a
 * signed recommendation is what prints.
 */
export function RecommendationPanel({ report }: { report: Report }) {
  const [items, setItems] = useState<Recommendation[]>([])
  const [text, setText] = useState('')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [provenance, setProvenance] = useState<'gemini' | 'heuristic' | 'engineer'>('engineer')
  const { pending, error, success, run } = useAsyncAction()

  const refresh = useCallback(async () => {
    try {
      setItems(await getRecommendations({ reportId: report.id }))
    } catch {
      setItems([])
    }
  }, [report.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleDraft = async () => {
    const draft = await run('Draft generated.', () =>
      getRecommendationDraftContext(report.id).then((context) => {
        if (!context.available) {
          // Thrown on the client so the sentence survives production error
          // sanitisation, unlike a server-side throw.
          throw new Error(context.reason)
        }
        return draftRecommendation({
          damageType: context.damageType,
          severity: context.severity,
          elementType: context.elementType,
          context: context.context,
        })
      })
    )
    if (draft) {
      setProvenance(draft.provenance)
      setText(`${draft.action}\n\n${draft.rationale}\n\n${draft.steps.map((step) => `• ${step}`).join('\n')}`)
    }
  }

  const handleSaveDraft = async () => {
    const created = await run('Draft saved.', () =>
      createRecommendation({ reportId: report.id, draftText: text, provenance })
    )
    if (created) {
      setCurrentId(created.id)
      await refresh()
    }
  }

  const handleSign = async () => {
    if (!currentId || !text.trim()) return
    const signed = await run('Recommendation signed.', () =>
      signRecommendation({ recommendationId: currentId, finalText: text.trim() })
    )
    if (signed) {
      setCurrentId(null)
      setText('')
      await refresh()
    }
  }

  return (
    <Panel
      title="Recommendation"
      description="Drafts use verified findings and saved costs. Review and sign the final wording before publication."
    >
      <Field label="Recommendation text" htmlFor="recommendation-text">
        <textarea
          id="recommendation-text"
          value={text}
          onChange={(event) => { setText(event.target.value); setProvenance('engineer') }}
 className={`${textareaClass} min-h-[140px]`}
          placeholder="Draft with the AI, then edit until it says what you would sign."
        />
      </Field>

      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {success && <InlineMessage tone="success">{success}</InlineMessage>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={handleDraft} disabled={pending} className="inline-flex items-center justify-center bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 min-h-[44px]">
          Draft with AI
        </button>
        <button type="button" onClick={handleSaveDraft} disabled={pending || !text.trim()} className="inline-flex items-center justify-center bg-white border border-slate-200 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50 min-h-[44px]">
          Save draft
        </button>
        <button type="button" onClick={handleSign} disabled={pending || !currentId || !text.trim()} className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]">
          Sign recommendation
        </button>
      </div>

      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-[11px] font-bold text-slate-500 mb-2">On this report</h4>
        {items.length === 0 ? (
          <EmptyState title="No recommendation yet" message="Drafts and signed recommendations appear here with their state and provenance." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={item.status === 'signed' ? 'good' : 'neutral'}>{item.status}</Chip>
                  <Chip tone="info">{item.provenance}</Chip>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {formatDate(item.signed_at ?? item.created_at)}
                  </span>
                </div>
                <p className="text-xs text-slate-700 font-medium whitespace-pre-line">
                  {item.final_text ?? item.draft_text ?? '—'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

/**
 * Crack taxonomy for the report's detections.
 *
 * The band is derived from the width once entered; the engineer chooses the
 * orientation, pattern and probable cause, which are judgements rather than
 * measurements.
 */
export function DetectionTaxonomyPanel({ inspectionId }: { inspectionId: string }) {
  const [detections, setDetections] = useState<AIDamageDetection[]>([])
  const [loading, setLoading] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [width, setWidth] = useState('')
  const [orientation, setOrientation] = useState<CrackOrientation>('vertical')
  const [pattern, setPattern] = useState<CrackPattern>('single')
  const [cause, setCause] = useState<CrackCause>('unknown')
  const { pending, error, success, run } = useAsyncAction()

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setDetections(await getDetectionsForInspection(inspectionId))
    } catch {
      setDetections([])
    } finally {
      setLoading(false)
    }
  }, [inspectionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSave = async (detectionId: string) => {
    const saved = await run('Crack classification saved.', () =>
      updateDetectionCrackTaxonomy({
        detectionId,
        widthMm: width.trim() ? Number(width) : null,
        orientation,
        pattern,
        cause,
      })
    )
    if (saved) {
      setOpenId(null)
      setWidth('')
      await refresh()
    }
  }

  return (
    <Panel
      title="Crack Classification"
      description="Width follows ACI 224R-01. Orientation, pattern and probable cause are the engineer's judgement."
    >
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      {success && <InlineMessage tone="success">{success}</InlineMessage>}

      {loading && <p className="text-xs text-slate-500 font-medium">Loading detections…</p>}
      {!loading && detections.length === 0 && (
        <EmptyState
          title="No detections on this inspection"
          message="Run the AI analysis on an inspection image first, then classify what it found."
        />
      )}

      {!loading && detections.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {detections.map((detection) => (
            <li key={detection.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-800">{detection.damage_type}</span>
                <Chip tone={detection.severity === 'critical' ? 'bad' : detection.severity === 'high' ? 'warn' : 'neutral'}>
                  {detection.severity}
                </Chip>
                <Chip tone="info">{detection.provenance ?? 'heuristic'}</Chip>
                <span className="text-[11px] text-slate-500 font-medium">
                  {Math.round(detection.confidence * 100)}% confidence
                </span>
                {detection.crack_width_band && <Chip tone="neutral">{detection.crack_width_band}</Chip>}
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(openId === detection.id ? null : detection.id)
                    setWidth(detection.crack_width_mm != null ? String(detection.crack_width_mm) : '')
                    setOrientation((detection.crack_orientation as CrackOrientation) ?? 'vertical')
                    setPattern((detection.crack_pattern as CrackPattern) ?? 'single')
                    setCause((detection.crack_cause as CrackCause) ?? 'unknown')
                  }}
                  className="ml-auto text-[11px] font-bold text-primary hover:underline"
                >
                  {openId === detection.id ? 'Close' : 'Classify'}
                </button>
              </div>

              {openId === detection.id && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2">
                  <Field label="Width (mm)" htmlFor={`width-${detection.id}`}>
                    <input
                      id={`width-${detection.id}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={width}
                      onChange={(event) => setWidth(event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Orientation" htmlFor={`orientation-${detection.id}`}>
                    <select id={`orientation-${detection.id}`} value={orientation} onChange={(event) => setOrientation(event.target.value as CrackOrientation)} className={inputClass}>
                      {Object.entries(ORIENTATION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Pattern" htmlFor={`pattern-${detection.id}`}>
                    <select id={`pattern-${detection.id}`} value={pattern} onChange={(event) => setPattern(event.target.value as CrackPattern)} className={inputClass}>
                      {Object.entries(PATTERN_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Probable cause" htmlFor={`cause-${detection.id}`}>
                    <select id={`cause-${detection.id}`} value={cause} onChange={(event) => setCause(event.target.value as CrackCause)} className={inputClass}>
                      {Object.entries(CAUSE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="sm:col-span-4">
                    <button
                      type="button"
                      onClick={() => handleSave(detection.id)}
                      disabled={pending}
                      className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
                    >
                      {pending ? 'Saving…' : 'Save classification'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
