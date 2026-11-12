'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addForensicEvidence,
  createForensicAssessment,
  getForensicAssessments,
} from '@/app/actions/structural'
import { useInspectionImages, useProfile } from '@/app/lib/queries'
import type { ForensicAssessment, ForensicHypothesis, Inspection } from '@/app/types'
import { Chip, EmptyState, Field, Panel, formatDate, inputClass, useAsyncAction } from './ui'

const HYPOTHESES: { value: ForensicHypothesis; label: string }[] = [
  { value: 'unknown', label: 'Undetermined' },
  { value: 'material', label: 'Material failure' },
  { value: 'design', label: 'Design deficiency' },
  { value: 'construction', label: 'Construction defect' },
  { value: 'overload', label: 'Overload' },
  { value: 'settlement', label: 'Foundation movement' },
  { value: 'deterioration', label: 'Deterioration over time' },
  { value: 'other', label: 'Other' },
]

/**
 * Forensic engineering.
 *
 * A hypothesis with a mechanism narrative and an evidence chain, not a free-text
 * field. The evidence links to specific images so the argument can be followed
 * rather than taken on trust.
 */
export function ForensicPanel({ inspection }: { inspection: Inspection }) {
  const { data: profile } = useProfile()
  const { data: images } = useInspectionImages(inspection.id)
  const [assessments, setAssessments] = useState<ForensicAssessment[]>([])
  const [loading, setLoading] = useState(false)
  const [hypothesis, setHypothesis] = useState<ForensicHypothesis>('unknown')
  const [narrative, setNarrative] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [evidenceImage, setEvidenceImage] = useState('')
  const [evidenceNote, setEvidenceNote] = useState('')
  const [latestId, setLatestId] = useState<string | null>(null)
  const { pending, error, success, run } = useAsyncAction()

  const canAuthor = profile?.role === 'engineer' || profile?.role === 'admin'

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setAssessments(await getForensicAssessments(inspection.id))
    } catch {
      setAssessments([])
    } finally {
      setLoading(false)
    }
  }, [inspection.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    const created = await run('Forensic assessment created.', () =>
      createForensicAssessment({
        inspectionId: inspection.id,
        failureHypothesis: hypothesis,
        mechanismNarrative: narrative.trim() || null,
        conclusion: conclusion.trim() || null,
        recommendedNextStep: nextStep.trim() || null,
      })
    )

    if (created) {
      setNarrative('')
      setConclusion('')
      setNextStep('')
      setLatestId(created.id)
      await refresh()
    }
  }

  const handleAttach = async (assessmentId: string) => {
    if (!evidenceImage) return
    const added = await run('Evidence attached.', () =>
      addForensicEvidence({
        assessmentId,
        imageId: evidenceImage,
        note: evidenceNote.trim() || null,
      })
    )

    if (added) {
      setEvidenceImage('')
      setEvidenceNote('')
      await refresh()
    }
  }

  return (
    <Panel
      title="Forensic Engineering"
      description="Record the failure hypothesis, the mechanism, and the evidence that supports it."
    >
      {!canAuthor ? (
        <EmptyState
          title="Engineering review only"
          message="Forensic assessments are written by an engineer or admin. Inspectors record the condition; the hypothesis is an engineering judgement."
        />
      ) : (
        <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Field label="Failure hypothesis" htmlFor="forensic-hypothesis">
            <select
              id="forensic-hypothesis"
              value={hypothesis}
              onChange={(event) => setHypothesis(event.target.value as ForensicHypothesis)}
              className={inputClass}
            >
              {HYPOTHESES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Recommended next step" htmlFor="forensic-next">
            <input
              id="forensic-next"
              value={nextStep}
              onChange={(event) => setNextStep(event.target.value)}
              className={inputClass}
              placeholder="e.g. Core sampling at column C3"
            />
          </Field>

          <div className="sm:col-span-2">
            <Field
              label="Mechanism narrative"
              hint="How the failure progressed, and why that explanation fits the observed evidence."
              htmlFor="forensic-narrative"
            >
              <textarea
                id="forensic-narrative"
                value={narrative}
                onChange={(event) => setNarrative(event.target.value)}
 className={`${inputClass} min-h-[110px] resize-y`}
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="Conclusion" htmlFor="forensic-conclusion">
              <textarea
                id="forensic-conclusion"
                value={conclusion}
                onChange={(event) => setConclusion(event.target.value)}
 className={`${inputClass} min-h-[84px] resize-y`}
              />
            </Field>
          </div>

          {error && <div className="sm:col-span-2 text-xs font-medium text-red-700">{error}</div>}
          {success && <div className="sm:col-span-2 text-xs font-medium text-emerald-700">{success}</div>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
            >
              {pending ? 'Saving…' : 'Create assessment'}
            </button>
          </div>
        </form>
      )}

      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-[11px] font-bold text-slate-500 mb-2">Assessments</h4>
        {loading && <p className="text-xs text-slate-500 font-medium">Loading…</p>}
        {!loading && assessments.length === 0 && (
          <EmptyState
            title="No forensic assessment yet"
            message="An assessment records the hypothesis, the mechanism and the images that support it."
          />
        )}
        {!loading &&
          assessments.map((assessment) => (
            <article key={assessment.id} className="py-3 border-b border-slate-200 last:border-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="info">{assessment.failure_hypothesis}</Chip>
                <span className="text-[11px] text-slate-500 font-medium">
                  {formatDate(assessment.created_at)}
                </span>
              </div>
              {assessment.mechanism_narrative && (
                <p className="text-xs sm:text-sm text-slate-700 font-medium leading-relaxed">
                  {assessment.mechanism_narrative}
                </p>
              )}
              {assessment.conclusion && (
                <p className="text-xs text-slate-600 font-medium">
                  <span className="font-bold text-[10px] text-slate-500">Conclusion · </span>
                  {assessment.conclusion}
                </p>
              )}
              {assessment.recommended_next_step && (
                <p className="text-xs text-slate-600 font-medium">
                  <span className="font-bold text-[10px] text-slate-500">Next step · </span>
                  {assessment.recommended_next_step}
                </p>
              )}

              {assessment.evidence && assessment.evidence.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5">
                  {assessment.evidence.map((item) => (
                    <li key={item.id} className="text-[11px] text-slate-600 font-medium">
                      Evidence · image {item.image_id?.slice(0, 8) ?? '—'}
                      {item.note ? ` · ${item.note}` : ''}
                    </li>
                  ))}
                </ul>
              )}

              {canAuthor && (
                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <select
                    aria-label="Evidence image"
                    value={latestId === assessment.id ? evidenceImage : ''}
                    onChange={(event) => {
                      setLatestId(assessment.id)
                      setEvidenceImage(event.target.value)
                    }}
 className={`${inputClass} max-w-[220px]`}
                  >
                    <option value="">Attach image…</option>
                    {(images ?? []).map((image) => (
                      <option key={image.id} value={image.id}>
                        {image.caption || image.storage_path.split('/').pop()}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Evidence note"
                    value={latestId === assessment.id ? evidenceNote : ''}
                    onChange={(event) => {
                      setLatestId(assessment.id)
                      setEvidenceNote(event.target.value)
                    }}
 className={`${inputClass} max-w-[240px]`}
                    placeholder="What this shows"
                  />
                  <button
                    type="button"
                    onClick={() => handleAttach(assessment.id)}
                    disabled={pending || !evidenceImage || latestId !== assessment.id}
                    className="inline-flex items-center justify-center bg-slate-900 text-white text-[11px] font-bold px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-40 min-h-[44px]"
                  >
                    Attach
                  </button>
                </div>
              )}
            </article>
          ))}
      </div>
    </Panel>
  )
}
