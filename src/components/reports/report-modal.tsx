'use client'

import { useEffect } from 'react'
import type { Report } from '@/app/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { RiskScore } from '@/components/shared/risk-score'
import { Button } from '@/components/ui/button'

type ReportModalProps = {
  report: Report | null
  onClose: () => void
}

export function ReportModal({ report, onClose }: ReportModalProps) {
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
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
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
            <div className="text-sm font-medium text-slate-900">{(report.project_name as any)?.name ?? 'Unknown'}</div>
            <div className="mt-2 text-xs font-semibold text-slate-500">Location</div>
            <div className="text-sm text-slate-700">{report.location}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">Inspection Date</div>
            <div className="text-sm font-medium text-slate-900">
              {new Date(report.date).toLocaleDateString()}
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-500">Lead Inspector</div>
            <div className="text-sm text-slate-700">{(report.lead_inspector_name as any)?.full_name ?? 'Unassigned'}</div>
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
