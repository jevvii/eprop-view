'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getChecklistSuggestions,
  getChecklistResponses,
  getChecklistTemplates,
  saveChecklistResponse,
} from '@/app/actions/structural'
import type {
  ChecklistAnswer,
  ChecklistResponse,
  ChecklistResponseItem,
  ChecklistTemplate,
  Inspection,
} from '@/app/types'
import { Chip, EmptyState, Panel, useAsyncAction } from './ui'

const ANSWER_LABEL: Record<ChecklistAnswer, string> = {
  yes: 'Yes',
  no: 'No',
  na: 'Not applicable',
}

/**
 * Flood and geohazard checklists.
 *
 * Items that map to a hazard layer are prefilled from the project's actual
 * geospatial zones. A prefilled answer is shown as a suggestion, never as a
 * confirmed finding: the inspector still has to accept or override it, and the
 * template version is stored with the answer set.
 */
export function ChecklistPanel({ inspection }: { inspection: Inspection }) {
  const [suggestions, setSuggestions] = useState<Record<string, boolean | null>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [responses, setResponses] = useState<ChecklistResponse[]>([])
  const [drafts, setDrafts] = useState<Record<string, ChecklistResponseItem[]>>({})
  const [loading, setLoading] = useState(false)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const { error, success, run } = useAsyncAction()

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [loadedTemplates, loadedResponses, loadedSuggestions] = await Promise.all([
        getChecklistTemplates(),
        getChecklistResponses(inspection.id),
        getChecklistSuggestions(inspection.id),
      ])
      setTemplates(loadedTemplates)
      setResponses(loadedResponses)
      setSuggestions(loadedSuggestions)
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'The site checklist could not be loaded.')
      setTemplates([])
      setResponses([])
    } finally {
      setLoading(false)
    }
  }, [inspection.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Build the working set for a template: saved answers win, otherwise an
   * automatic item is suggested from zone membership, otherwise it is blank.
   */
  useEffect(() => {
    if (templates.length === 0) return
    const next: Record<string, ChecklistResponseItem[]> = {}

    for (const template of templates) {
      const saved = responses.find(
        (response) =>
          response.template_code === template.code && response.template_version === template.version
      )

      next[template.code] = template.items.map((item) => {
        const savedItem = saved?.responses?.find((entry) => entry.key === item.key)
        if (savedItem) return savedItem

        if (item.auto) {
          const matched = suggestions[item.auto] ?? null
          return {
            key: item.key,
            answer: matched === true ? ('yes' as ChecklistAnswer) : matched === false ? ('no' as ChecklistAnswer) : null,
            prefilled: true,
            note: matched == null
              ? 'No applicable spatial coverage is available. Verify independently.'
              : `Spatial suggestion: ${matched ? 'Yes' : 'No'}, from the actual site geometry. Confirm or override it.`,
          }
        }

        return { key: item.key, answer: null }
      })
    }

    setDrafts(next)
  }, [templates, responses, suggestions])

  const setAnswer = (code: string, key: string, answer: ChecklistAnswer) => {
    setDrafts((current) => ({
      ...current,
      [code]: (current[code] ?? []).map((item) =>
        item.key === key ? { ...item, answer, prefilled: false, note: item.note } : item
      ),
    }))
  }

  const handleSave = async (template: ChecklistTemplate) => {
    setSavingCode(template.code)
    await run(`${template.title} saved.`, () =>
      saveChecklistResponse({
        inspectionId: inspection.id,
        templateCode: template.code,
        responses: drafts[template.code] ?? [],
      })
    )
    setSavingCode(null)
    await refresh()
  }

  if (loading) {
    return (
      <Panel title="Site Checklists">
        <p className="text-xs text-slate-500 font-medium">Loading checklists…</p>
      </Panel>
    )
  }

  if (loadError) {
    return <Panel title="Site Checklists"><p role="alert" className="text-sm text-red-700">{loadError}</p></Panel>
  }

  if (templates.length === 0) {
    return (
      <Panel title="Site Checklists">
        <EmptyState
          title="No checklist templates available"
          message="Flood and geohazard templates are seeded by the database migration. If none appear, the template rows are missing."
        />
      </Panel>
    )
  }

  return (
    <Panel
      title="Site Checklists"
      description="Suggestions use actual site intersections and distance to complete fault traces (near: under 5 km). Confirm every suggestion and answer every item before saving."
    >
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      {success && <p className="text-xs font-medium text-emerald-700">{success}</p>}

      {templates.map((template) => {
        const saved = responses.find((response) => response.template_code === template.code)
        const items = drafts[template.code] ?? []
        const answered = items.filter((item) => item.answer !== null && !item.prefilled).length

        return (
          <section key={template.id} className="rounded-2xl border border-slate-200 p-4 space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900">{template.title}</h4>
                <p className="text-[11px] text-slate-500 font-medium uppercase tracking-wide">
                  Version {template.version} · {answered}/{items.length} answered
                </p>
              </div>
              {saved?.completed_at && <Chip tone="good">Saved {new Date(saved.completed_at).toLocaleDateString()}</Chip>}
            </header>

            <ul className="space-y-2.5">
              {template.items.map((item) => {
                const draft = items.find((entry) => entry.key === item.key)
                const groupName = `${template.code}-${item.key}`

                return (
                  <li key={item.key} className="space-y-1">
                    <p className="text-xs sm:text-sm font-medium text-slate-800">{item.label}</p>
                    <div role="radiogroup" aria-label={item.label} className="flex flex-wrap gap-1.5">
                      {(['yes', 'no', 'na'] as ChecklistAnswer[]).map((answer) => {
                        const selected = draft?.answer === answer && !draft?.prefilled
                        return (
                          <label
                            key={answer}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all min-h-[40px] focus-within:ring-2 focus-within:ring-primary ${
                              selected
                                ? 'bg-primary text-white border-primary'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input type="radio" name={groupName} value={answer} checked={selected} onChange={() => setAnswer(template.code, item.key, answer)} />
                            {ANSWER_LABEL[answer]}
                          </label>
                        )
                      })}
                    </div>
                    {draft?.prefilled && draft.note && (
                      <p className="text-[11px] text-amber-800 font-medium">{draft.note}</p>
                    )}
                  </li>
                )
              })}
            </ul>

            <button
              type="button"
              onClick={() => handleSave(template)}
              disabled={savingCode === template.code}
              className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
            >
              {savingCode === template.code ? 'Saving…' : 'Save checklist'}
            </button>
          </section>
        )
      })}
    </Panel>
  )
}
