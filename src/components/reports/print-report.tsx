'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { Report } from '@/app/types'
import { getReportPublication } from '@/app/actions/reports-v2'
import { formatPhp } from '@/app/lib/structural/cost-table'
import { preparePrintEvidence } from '@/app/lib/print-evidence'

interface PrintReportProps {
  reports: Report[]
  projectName: string
  generatedBy: string
  stats: { open: number; in_review: number; critical: number; completed: number }
  selectedReport?: Report | null
  onReadyChange?: (ready: boolean) => void
  onError?: (message: string | null) => void
}

type Publication = Awaited<ReturnType<typeof getReportPublication>>

function ReviewContent({ content }: { content: Publication }) {
  return (
    <div className="space-y-5">
      <section>
        <h4 className="text-sm font-bold uppercase">Signed recommendations</h4>
        {content.recommendations.length === 0 ? <p className="text-xs mt-2">No current signed recommendation. This report is not ready for final publication.</p> : (
          <ul className="space-y-3 mt-2">
            {content.recommendations.map((recommendation) => (
              <li key={recommendation.id} className="text-xs whitespace-pre-line leading-relaxed">
                {recommendation.final_text}
                <p className="text-[11px] text-slate-600 mt-1">Draft source: {recommendation.provenance}. Signed by {recommendation.signed_by} on {new Date(recommendation.signed_at!).toLocaleString()}.</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h4 className="text-sm font-bold uppercase">Assessment limitations</h4>
        {content.limitation ? (
          <>
            <ul className="list-disc pl-5 text-xs space-y-1 mt-2">
              {content.limitation.standard_exclusions.map((text) => <li key={text}>{text}</li>)}
            </ul>
            <p className="text-xs whitespace-pre-line mt-2">{content.limitation.free_text}</p>
            {Object.entries(content.limitation.element_notes).map(([element, note]) => <p key={element} className="text-xs mt-1">{element}: {note}</p>)}
          </>
        ) : <p className="text-xs mt-2">No limitation statement recorded. Do not interpret this document as a complete structural assessment.</p>}
      </section>
      <section>
        <h4 className="text-sm font-bold uppercase">Planning repair costs (PHP)</h4>
        {content.costs.length === 0 ? <p className="text-xs mt-2">No cost estimate recorded.</p> : (
          <ul className="text-xs space-y-2 mt-2">
            {content.costs.map((cost) => <li key={cost.id}>
              Table: {formatPhp(cost.table_estimate_php)}. {cost.ai_likely_php != null && <>AI advisory range: {formatPhp(cost.ai_low_php)}–{formatPhp(cost.ai_high_php)}; likely {formatPhp(cost.ai_likely_php)}. </>}
              Source: {cost.provenance}. {cost.divergence_flag ? (cost.confirmed_at ? 'Divergence confirmed by reviewer.' : 'Divergence unconfirmed; not an approved figure.') : 'No divergence flagged.'}
              {cost.override_reason && <p>Review basis: {cost.override_reason}</p>}
            </li>)}
          </ul>
        )}
      </section>
      {content.detections.length > 0 && <section>
        <h4 className="text-sm font-bold uppercase">Image findings and method</h4>
        <p className="text-[11px] mt-1">Automated suggestions require engineering review. Heuristic scores are not calibrated diagnostic accuracy.</p>
        <ul className="space-y-2 mt-2 text-xs">
          {content.detections.map((detection) => <li key={detection.id} className="rounded-lg border border-slate-200 p-3">
            <strong>{detection.damage_type} · {detection.severity}</strong> · score {Number(detection.severity_score).toFixed(1)}/100 · method {detection.provenance ?? 'unknown'} · {detection.verified_by ? 'Engineer verified' : 'Unverified suggestion'}
            <p>{detection.provenance === 'heuristic' ? 'Heuristic response strength' : 'Model-reported confidence'}: {(detection.confidence * 100).toFixed(1)}%.</p>
            {detection.damage_type === 'crack' && <p>
              Recorded width: {detection.crack_width_mm == null ? 'not measured' : `${detection.crack_width_mm} mm`} · project width band: {detection.crack_width_band ?? 'unclassified'} · orientation: {detection.crack_orientation ?? 'not recorded'} · pattern: {detection.crack_pattern ?? 'not recorded'} · cause: {detection.crack_cause ?? 'undetermined'}.
              {detection.aci_reference && <> Exposure guidance: {detection.aci_reference}.</>}
            </p>}
            {detection.notes && <p className="whitespace-pre-line">{detection.notes}</p>}
          </li>)}
        </ul>
      </section>}
      {content.images.length > 0 && <section><h4 className="text-sm font-bold uppercase">Photographic evidence</h4><div className="grid grid-cols-2 gap-3 mt-2">{content.images.map((image) => <figure key={image.id} className="border border-slate-200 p-2">{image.signed_url && <img src={image.signed_url} alt={image.caption} width={640} height={480} className="w-full h-auto" />}<figcaption className="text-xs mt-1">{image.caption}</figcaption></figure>)}</div></section>}
      {content.anchors.length > 0 && <section>
        <h4 className="text-sm font-bold uppercase">Captured inspection evidence</h4>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {content.anchors.map((anchor) => <figure key={anchor.id} className="border border-slate-200 rounded-lg p-3">
            {anchor.image_url ? <img src={anchor.image_url} alt={`Captured evidence: ${anchor.label}`} width={640} height={480} className="w-full h-auto" /> : <p className="text-xs">No captured photograph for this point.</p>}
            <figcaption className="text-xs mt-2">{anchor.label} · {anchor.damage_type ?? 'annotation'}. Coordinates are session/reference annotations, not surveyed measurements.</figcaption>
          </figure>)}
        </div>
      </section>}
    </div>
  )
}

export function PrintReport({ reports, projectName, generatedBy, stats, selectedReport, onReadyChange, onError }: PrintReportProps) {
  const container = useRef<HTMLDivElement>(null)
  const [evidence, setEvidence] = useState<{ key: string; ready: boolean; error: string | null }>({ key: '', ready: false, error: null })
  const displayReports = selectedReport ? [selectedReport] : reports
  const results = useQueries({ queries: displayReports.map((report) => ({
    queryKey: ['report-publication', report.id, report.updated_at],
    queryFn: () => getReportPublication(report.id),
    staleTime: 0,
    retry: false,
  })) })
  const dataReady = displayReports.length > 0 && results.every((result) => result.isSuccess && !result.isFetching)
  const scope = displayReports.map((report) => report.id).join(',')
  const evidenceKey = JSON.stringify([scope, results.flatMap((result) => result.data ? [
    ...result.data.images.map((image) => image.signed_url),
    ...result.data.anchors.map((anchor) => anchor.image_url),
  ] : [])])
  const evidenceError = evidence.key === evidenceKey ? evidence.error : null
  const ready = dataReady && evidence.key === evidenceKey && evidence.ready
  const error = evidenceError ?? (results.some((result) => result.isError) ? 'Report review content could not be loaded. Reload before printing; do not publish an incomplete report.' : null)
  useEffect(() => {
    if (!dataReady || !container.current) return
    let cancelled = false
    void preparePrintEvidence(Array.from(container.current.querySelectorAll('img'))).then(() => {
      if (!cancelled) setEvidence({ key: evidenceKey, ready: true, error: null })
    }).catch(() => {
      if (!cancelled) setEvidence({ key: evidenceKey, ready: false, error: 'Photographic evidence could not be loaded. Reload before printing.' })
    })
    return () => { cancelled = true }
  }, [dataReady, evidenceKey])
  useEffect(() => { onReadyChange?.(ready) }, [ready, scope, onReadyChange])
  useEffect(() => { onError?.(error) }, [error, onError])

  return (
    <div ref={container} className="print-report font-sans text-black bg-white" data-print-ready={ready ? 'true' : 'false'}>
      <header className="border-b-4 border-black pb-6 mb-8">
        <h1 className="text-4xl font-koulen">EPROP VIEW</h1>
        <h2 className="text-xl font-bold mt-3">{selectedReport ? 'Inspection report' : 'Inspection report registry'}</h2>
        <p className="text-xs mt-2">Project: {projectName} · Prepared by: {generatedBy} · Generated: {new Date().toLocaleString()}</p>
        {!selectedReport && <p className="text-xs mt-2">Open: {stats.open} · In review: {stats.in_review} · Critical: {stats.critical} · Completed: {stats.completed}</p>}
      </header>
      {!ready && <p role={error ? 'alert' : 'status'} className="text-sm mb-6">{error ?? 'Loading report review content and photographs before printing…'}</p>}
      <div className="space-y-10">
        {displayReports.map((report, index) => <article key={report.id} className="avoid-break border-b border-slate-200 pb-8">
          <h3 className="text-xl font-bold">{report.report_id} · {report.title}</h3>
          <p className="text-xs mt-2">Date: {new Date(report.date).toLocaleDateString()} · Location: {report.location} · Risk: {report.risk_score}/10 · Status: {report.status.replace('_', ' ')}</p>
          <p className="text-xs mt-1">{report.status === 'completed' && report.reviewed_by && report.reviewed_at ? `Reviewed by ${report.reviewed_by_name ?? report.reviewed_by} on ${new Date(report.reviewed_at).toLocaleString()}.` : 'DRAFT / review incomplete. No final engineering certification is implied.'}</p>
          <section className="my-5"><h4 className="text-sm font-bold uppercase">Technical findings</h4><p className="text-xs leading-relaxed whitespace-pre-line mt-2">{report.key_findings || 'No findings recorded.'}</p><p className="text-[11px] mt-1">Narrative source: {(report as Report & { findings_provenance?: string }).findings_provenance ?? 'engineer'}.</p></section>
          {results[index].data && <ReviewContent content={results[index].data} />}
        </article>)}
      </div>
      <footer className="mt-8 text-[11px] text-slate-700">Decision-support capstone record. Findings describe the recorded inspection conditions and limitations. AI and heuristic suggestions do not certify structural safety; the identified reviewer remains responsible for the signed recommendation.</footer>
    </div>
  )
}
