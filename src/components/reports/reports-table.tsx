'use client'

import { useEffect, useState } from 'react'
import type { Report } from '@/app/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { RiskScore } from '@/components/shared/risk-score'
import { Button } from '@/components/ui/button'
import { ReportModal } from './report-modal'

type ReportsTableProps = {
  reports?: Report[]
  isLoading: boolean
  isError: boolean
}

export function ReportsTable({ reports, isLoading, isError }: ReportsTableProps) {
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [modalReport, setModalReport] = useState<Report | null>(null)

  useEffect(() => {
    if (!reports || reports.length === 0) {
      setSelectedReport(null)
      return
    }
    setSelectedReport((current) => current ?? reports[0])
  }, [reports])

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-72 animate-pulse" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load reports
      </div>
    )
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-slate-500">
        No reports found for the selected project.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr,1fr]">
      <div className="bg-white p-6 rounded-2xl shadow-lg">
        <div className="overflow-x-auto" aria-label="Inspection reports" tabIndex={0}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className="text-left py-2 font-semibold text-slate-600">Report</th>
                <th scope="col" className="text-left py-2 font-semibold text-slate-600">Project</th>
                <th scope="col" className="text-left py-2 font-semibold text-slate-600">Date</th>
                <th scope="col" className="text-left py-2 font-semibold text-slate-600">Status</th>
                <th scope="col" className="text-left py-2 font-semibold text-slate-600">Risk Score</th>
                <th scope="col" className="text-left py-2 font-semibold text-slate-600">Inspector</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => {
                const isSelected = selectedReport?.id === report.id
                return (
                  <tr
                    key={report.id}
                    className={`border-b border-slate-100 cursor-pointer ${isSelected ? 'bg-slate-50' : ''}`}
                    onClick={() => setSelectedReport(report)}
                  >
                    <td className="py-3">
                      <div className="font-semibold text-slate-900">{report.title}</div>
                      <div className="text-xs text-slate-500">{report.report_id}</div>
                    </td>
                    <td className="py-3 text-slate-600">{report.project_name ?? 'Unknown'}</td>
                    <td className="py-3 text-slate-600">
                      {new Date(report.date).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="py-3">
                      <RiskScore score={report.risk_score} />
                    </td>
                    <td className="py-3 text-slate-600">{report.lead_inspector_name ?? 'Unassigned'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-lg">
        {selectedReport ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">{selectedReport.report_id}</div>
              <StatusBadge status={selectedReport.status} />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-slate-900">{selectedReport.title}</h4>
              <div className="text-sm text-slate-500">{selectedReport.project_name ?? 'Unknown project'}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div>
                <div className="text-xs font-semibold text-slate-500">Date</div>
                {new Date(selectedReport.date).toLocaleDateString()}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Location</div>
                {selectedReport.location}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Inspector</div>
                {selectedReport.lead_inspector_name ?? 'Unassigned'}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Risk Score</div>
                <RiskScore score={selectedReport.risk_score} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
              <div className="text-xs font-semibold text-slate-500 mb-1">Key Findings</div>
              <p className="whitespace-pre-line">
                {selectedReport.key_findings || 'No findings recorded yet.'}
              </p>
            </div>
            <Button variant="outline" onClick={() => setModalReport(selectedReport)}>
              Open Full Report
            </Button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Select a report to preview.
          </div>
        )}
      </div>

      <ReportModal report={modalReport} onClose={() => setModalReport(null)} />
    </div>
  )
}
