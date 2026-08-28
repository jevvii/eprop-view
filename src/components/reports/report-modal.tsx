'use client'

import { useEffect } from 'react'
import type { Report } from '@/app/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { RiskScore } from '@/components/shared/risk-score'
import { Button } from '@/components/ui/button'
import { useAIDetectionsForInspection, useARAnchors } from '@/app/lib/queries'

type ReportModalProps = {
  report: Report | null
  onClose: () => void
}

export function ReportModal({ report, onClose }: ReportModalProps) {
  const { data: detections = [] } = useAIDetectionsForInspection(report?.inspection_id || undefined)
  const { data: anchors = [] } = useARAnchors(report?.inspection_id || undefined)

  useEffect(() => {
    if (!report) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [report, onClose])

  if (!report) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 id="report-modal-title" className="text-xl font-semibold text-slate-900">
              {report.title}
            </h3>
            <p className="text-sm text-slate-500">Report ID: {report.report_id}</p>
          </div>
          <StatusBadge status={report.status} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Project</div>
            <div className="text-sm font-medium text-slate-900">{report.project_name ?? 'Unknown'}</div>
            <div className="mt-2 text-xs font-semibold text-slate-500">Location</div>
            <div className="text-sm text-slate-700">{report.location}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Inspection Date</div>
            <div className="text-sm font-medium text-slate-900">
              {new Date(report.date).toLocaleDateString()}
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-500">Lead Inspector</div>
            <div className="text-sm text-slate-700">{report.lead_inspector_name ?? 'Unassigned'}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 md:col-span-2">
            <div className="text-xs font-semibold text-slate-500">Risk Score</div>
            <div className="mt-1">
              <RiskScore score={report.risk_score} />
            </div>
            <div className="mt-4 text-xs font-semibold text-slate-500">Key Findings</div>
            <p className="text-sm text-slate-700 whitespace-pre-line">
              {report.key_findings || 'No findings recorded yet.'}
            </p>
          </div>

          {(detections.length > 0 || anchors.length > 0) && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 md:col-span-2 space-y-3">
              <div className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
                AI & AR Inspection Telemetry
              </div>
              
              {detections.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    AI Damage Detections ({detections.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detections.map((d) => (
                      <div key={d.id} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold flex items-center gap-1.5">
                        <span className="uppercase text-slate-800">{d.damage_type}</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.2 rounded uppercase ${
                          d.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          d.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                          d.severity === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {d.severity}
                        </span>
                        <span className="text-[10px] text-slate-400">{(d.confidence * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {anchors.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    AR Spatial Anchors ({anchors.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {anchors.map((a) => (
                      <div key={a.id} className="bg-white px-2.5 py-1 rounded-lg border border-indigo-100 text-xs font-semibold text-indigo-900">
                        📍 {a.label} <span className="text-slate-400 font-normal text-[10px]">({a.damage_type ?? 'defect'})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}
