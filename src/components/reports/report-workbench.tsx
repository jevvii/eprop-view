'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import {
  createShareToken,
  getReportLimitation,
  getReportRevisions,
  getReportNarrativeContext,
  getReportShareTokens,
  revokeShareToken,
  updateReportWithRevision,
  upsertReportLimitation,
} from '@/app/actions/reports-v2'
import { draftReportNarrative, getGeminiAvailability } from '@/app/actions/gemini-analysis'
import type { Report, ReportLimitation, ReportRevision, ShareToken } from '@/app/types'
import { Chip, EmptyState, Field, InlineMessage, Panel, formatDate, inputClass, textareaClass, useAsyncAction } from '@/components/structural/ui'

const STATUS_OPTIONS = ['open', 'in_review', 'critical', 'completed'] as const

const DEFAULT_EXCLUSIONS = [
  'Visual assessment only; no destructive or laboratory testing performed',
  'No foundation exposure or excavation undertaken',
  'Inaccessible or concealed areas were not inspected',
  'No load testing was performed',
  'Findings reflect conditions observed on the inspection date only',
]

/**
 * Report editing with revision history, and the assessment-limitation statement.
 *
 * The previous version is snapshotted before each save, so an edit never
 * destroys what the report said before. Completed reports stay locked until an
 * engineer reopens them.
 */
export function ReportWorkbench({ report }: { report: Report }) {
  const [title, setTitle] = useState(report.title)
  const [date, setDate] = useState(report.date)
  const [location, setLocation] = useState(report.location)
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>(report.status)
  const [riskScore, setRiskScore] = useState(String(report.risk_score))
  const [findings, setFindings] = useState(report.key_findings ?? '')
  const [findingsProvenance, setFindingsProvenance] = useState<'gemini'|'heuristic'|'engineer'>((report as Report & { findings_provenance?: 'gemini'|'heuristic'|'engineer' }).findings_provenance ?? 'engineer')
  const [narrativeInfo, setNarrativeInfo] = useState('')
  const [notice, setNotice] = useState('Google may process submitted report context. Do not submit confidential client data.')
  const narrative = useAsyncAction()
  const queryClient = useQueryClient()
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState(report.updated_at)
  const [currentStatus, setCurrentStatus] = useState(report.status)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reopen, setReopen] = useState(false)

  const [revisions, setRevisions] = useState<ReportRevision[]>([])
  const [limitation, setLimitation] = useState<ReportLimitation | null>(null)
  const [exclusions, setExclusions] = useState<string[]>(DEFAULT_EXCLUSIONS)
  const [freeText, setFreeText] = useState('')
  const [loading, setLoading] = useState(false)

  const save = useAsyncAction()
  const limits = useAsyncAction()
  const share = useAsyncAction()
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareTokens, setShareTokens] = useState<ShareToken[]>([])
  const [shareLoadError, setShareLoadError] = useState<string | null>(null)
  const isLocked = currentStatus === 'completed' && !reopen

  const refreshShares = useCallback(async () => {
    try {
      setShareTokens(await getReportShareTokens(report.id))
      setShareLoadError(null)
    } catch (error) {
      setShareLoadError(error instanceof Error ? error.message : 'Share links could not be loaded.')
    }
  }, [report.id])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [loadedRevisions, loadedLimitation] = await Promise.all([
        getReportRevisions(report.id),
        getReportLimitation(report.id),
      ])
      setLoadError(null)
      setRevisions(loadedRevisions)
      setLimitation(loadedLimitation)
      if (loadedLimitation) {
        setExclusions(loadedLimitation.standard_exclusions ?? DEFAULT_EXCLUSIONS)
        setFreeText(loadedLimitation.free_text ?? '')
      }
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Could not load report history. Check database setup.')
    } finally {
      setLoading(false)
    }
  }, [report.id])

  useEffect(() => {
    void refresh()
    void refreshShares()
    void getGeminiAvailability().then((availability) => setNotice(availability.notice)).catch(() => setNotice('AI service availability could not be checked. Drafts require engineer review.'))
  }, [refresh, refreshShares])

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    const score = Number(riskScore)
    if (!Number.isFinite(score) || score < 0 || score > 10) return

    const result = await save.run('Report saved as a new revision.', () =>
      updateReportWithRevision({
        reportId: report.id,
        title: title.trim(),
        date,
        location: location.trim(),
        status,
        riskScore: score,
        keyFindings: findings,
        findingsProvenance,
        reopen,
        expectedUpdatedAt: currentUpdatedAt,
      })
    )

    if (result) {
      setCurrentUpdatedAt(String(result.report.updated_at))
      setCurrentStatus(result.report.status as Report['status'])
      setStatus(result.report.status as Report['status'])
      setReopen(false)
      await queryClient.invalidateQueries({ queryKey: ['report', report.id] })
      await queryClient.invalidateQueries({ queryKey: ['reports'] })
      await queryClient.invalidateQueries({ queryKey: ['report-publication', report.id] })
      await refresh()
    }
  }

  const handleDraftNarrative = async () => {
    const result = await narrative.run('Narrative drafted. Review the wording before saving.', async () =>
      draftReportNarrative(await getReportNarrativeContext(report.id))
    )
    if (result) {
      setFindings(result.narrative)
      setFindingsProvenance(result.provenance)
      setNarrativeInfo(result.model ? `Draft source: Gemini (${result.model}).` : `Draft source: deterministic heuristic. ${result.fallbackReason ?? ''}`)
    }
  }

  const handleSaveLimitations = async (event: React.FormEvent) => {
    event.preventDefault()
    await limits.run('Limitation statement saved.', () =>
      upsertReportLimitation({
        reportId: report.id,
        standardExclusions: exclusions.filter(Boolean),
        freeText: freeText.trim() || null,
      })
    )
    await refresh()
  }

  const toggleExclusion = (text: string) => {
    setExclusions((current) =>
      current.includes(text) ? current.filter((item) => item !== text) : [...current, text]
    )
  }

  const handleShare = async () => {
    const token = await share.run('Share link created. It expires in 14 days.', () =>
      createShareToken(report.id, 14)
    )
    if (token) {
      setShareUrl(`${window.location.origin}/share/${token.token}`)
      await refreshShares()
    }
  }

  const handleRevokeShare = async (token: ShareToken) => {
    const revoked = await share.run('Share link revoked. Its snapshot is no longer public.', async () => {
      await revokeShareToken(token.id)
      return true
    })
    if (revoked) {
      if (shareUrl?.endsWith(`/share/${token.token}`)) setShareUrl(null)
      await refreshShares()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/reports" className="text-[11px] font-bold text-primary hover:underline">
            ← Back to reports
          </Link>
          <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase mt-1">{report.report_id}</h2>
          <p className="text-xs text-slate-500 font-medium">{report.project_name} · {report.lead_inspector_name || 'No lead inspector'}</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip tone={report.status === 'completed' ? 'good' : report.status === 'critical' ? 'bad' : 'info'}>
            {report.status.replace('_', ' ')}
          </Chip>
          {report.last_edited_at && (
            <span className="text-[11px] text-slate-500 font-medium">
              Last edited {formatDate(report.last_edited_at)}
            </span>
          )}
        </div>
      </div>

      <Panel
        title="Report Content"
        description="Every field is editable. Saving snapshots the current version into the revision history first."
        action={currentStatus === 'completed' ? (
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input type="checkbox" checked={reopen} onChange={(event) => setReopen(event.target.checked)} />
            Reopen to edit
          </label>
        ) : undefined}
      >
        {loadError && <InlineMessage tone="error">{loadError}</InlineMessage>}
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="sm:col-span-2">
            <Field label="Title" htmlFor="report-title">
              <input id="report-title" value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
            </Field>
          </div>

          <Field label="Date" htmlFor="report-date">
            <input id="report-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className={inputClass} />
          </Field>

          <Field label="Status" htmlFor="report-status">
            <select
              id="report-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as (typeof STATUS_OPTIONS)[number])}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option.replace('_', ' ')}</option>
              ))}
            </select>
          </Field>

          <Field label="Location" htmlFor="report-location">
            <input id="report-location" value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} />
          </Field>

          <Field label="Risk score (0–10)" htmlFor="report-risk">
            <input
              id="report-risk"
              type="number"
              min="0"
              max="10"
              step="0.1"
              value={riskScore}
              onChange={(event) => setRiskScore(event.target.value)}
              className={inputClass}
            />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Key findings" htmlFor="report-findings">
              <textarea
                id="report-findings"
                value={findings}
                onChange={(event) => { setFindings(event.target.value); setFindingsProvenance('engineer') }}
                className={textareaClass}
              />
            </Field>
            <p className="text-[11px] text-slate-600 mt-2">{notice}</p>
            <button type="button" onClick={handleDraftNarrative} disabled={narrative.pending || isLocked} className="mt-2 min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold disabled:opacity-50">{narrative.pending ? 'Drafting…' : 'Draft from saved findings'}</button>
            {narrativeInfo && <p className="text-xs text-slate-600 mt-2">{narrativeInfo}</p>}
            {narrative.error && <InlineMessage tone="error">{narrative.error}</InlineMessage>}
          </div>

          {save.error && <div className="sm:col-span-2"><InlineMessage tone="error">{save.error}</InlineMessage></div>}
          {save.success && <div className="sm:col-span-2"><InlineMessage tone="success">{save.success}</InlineMessage></div>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={save.pending || isLocked}
              className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
            >
              {save.pending ? 'Saving…' : 'Save revision'}
            </button>
            {isLocked && (
              <p className="text-[11px] text-slate-500 font-medium mt-2">
                This report is completed and locked. Tick “Reopen to edit” to unlock it.
              </p>
            )}
          </div>
        </form>
      </Panel>

      <Panel
        title="Assessment Limitations"
        description="Printed with the report so a reader knows what the inspection did not cover."
      >
        <form onSubmit={handleSaveLimitations} className="space-y-3">
          <fieldset className="space-y-2">
            <legend className="text-[11px] font-bold text-slate-500 mb-1.5">
              Standard exclusions
            </legend>
            {DEFAULT_EXCLUSIONS.map((text) => (
              <label key={text} className="flex items-start gap-2.5 text-xs sm:text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={exclusions.includes(text)}
                  onChange={() => toggleExclusion(text)}
                  className="mt-0.5"
                />
                <span>{text}</span>
              </label>
            ))}
          </fieldset>

          <Field label="Additional limitations" htmlFor="report-limit-free">
            <textarea
              id="report-limit-free"
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              className={textareaClass}
              placeholder="Anything specific to this site that limited the assessment"
            />
          </Field>

          {limits.error && <InlineMessage tone="error">{limits.error}</InlineMessage>}
          {limits.success && <InlineMessage tone="success">{limits.success}</InlineMessage>}

          <button
            type="submit"
            disabled={limits.pending || currentStatus === 'completed'}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {limits.pending ? 'Saving…' : 'Save limitation statement'}
          </button>

          {limitation && (
            <p className="text-[11px] text-slate-500 font-medium">
              Saved {formatDate(limitation.updated_at)} · {limitation.standard_exclusions.length} exclusions on record
            </p>
          )}
        </form>
      </Panel>

      <Panel title="Revision History" description="Each save stores the version it replaced.">
        {loading && <p className="text-xs text-slate-500 font-medium">Loading…</p>}
        {!loading && revisions.length === 0 && (
          <EmptyState
            title="No revisions yet"
            message="The first save of this report creates revision 1 with the version it replaced."
          />
        )}
        {!loading && revisions.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {revisions.map((revision) => {
              const snapshot = revision.snapshot as Record<string, unknown>
              return (
                <li key={revision.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="neutral">Revision {revision.revision_number}</Chip>
                    <span className="text-[11px] text-slate-500 font-medium">
                      {formatDate(revision.changed_at)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium">
                    {String(snapshot.title ?? '—')} · {String(snapshot.status ?? '—')} · risk {String(snapshot.risk_score ?? '—')}
                  </p>
                  {snapshot.key_findings ? (
                    <p className="text-[11px] text-slate-500 font-medium line-clamp-2">
                      {String(snapshot.key_findings)}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Share"
        description="Creates a read-only link showing this report, its signed recommendations and its limitation statement. The link expires and can be revoked."
      >
        {share.error && <InlineMessage tone="error">{share.error}</InlineMessage>}
        {shareLoadError && <InlineMessage tone="error">{shareLoadError}</InlineMessage>}
        {share.success && <InlineMessage tone="success">{share.success}</InlineMessage>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            disabled={share.pending || currentStatus !== 'completed'}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {share.pending ? 'Creating…' : 'Create share link'}
          </button>
          {shareUrl && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => undefined)}
              className="inline-flex items-center justify-center bg-white border border-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all min-h-[44px]"
            >
              Copy link
            </button>
          )}
        </div>

        {shareUrl && (
          <p className="break-all rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
            {shareUrl}
          </p>
        )}
        {shareTokens.length > 0 && (
          <div className="border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold text-slate-600">Recent share links (up to 100)</h4>
            <ul className="mt-2 divide-y divide-slate-100">
              {shareTokens.map((token) => {
                const expired = token.expires_at !== null && Date.parse(token.expires_at) <= Date.now()
                const active = !token.revoked_at && !expired
                return (
                  <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="text-xs text-slate-600">
                      <p>Created {formatDate(token.created_at)}</p>
                      <p>{token.revoked_at ? 'Revoked' : expired ? 'Expired' : 'Active'} · Expires {token.expires_at ? formatDate(token.expires_at) : 'not recorded'}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {active && <a href={`/share/${token.token}`} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex items-center rounded-xl border border-slate-200 px-3 text-xs font-bold text-primary">Open shared snapshot</a>}
                      {!token.revoked_at && <button type="button" onClick={() => handleRevokeShare(token)} disabled={share.pending} className="min-h-11 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 disabled:opacity-50">Revoke share link</button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  )
}
