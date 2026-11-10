'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Report } from '@/app/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { RiskScore } from '@/components/shared/risk-score'
import { Button } from '@/components/ui/button'
import { ReportModal } from './report-modal'
import { useUpdateReport } from '@/app/lib/mutations'
import { useProfile } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'

type ReportsTableProps = {
  reports?: Report[]
  isLoading: boolean
  isError: boolean
  selectedReport: Report | null
  setSelectedReport: (report: Report | null) => void
  onPrintSelected: () => void
}

const statusOptions = ['open', 'in_review', 'critical', 'completed'] as const

export function ReportsTable({ 
  reports, 
  isLoading, 
  isError, 
  selectedReport, 
  setSelectedReport,
  onPrintSelected
}: ReportsTableProps) {
  const { data: profile } = useProfile()
  const [modalReport, setModalReport] = useState<Report | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const updateReport = useUpdateReport()

  const canViewAudit = hasCapability(profile?.role, 'audit:view')
  const canEditReport = hasCapability(profile?.role, 'report:edit')

  const [isEditing, setIsEditing] = useState(false)
  const [editStatus, setEditStatus] = useState<(typeof statusOptions)[number]>('open')
  const [editRiskScore, setEditRiskScore] = useState('0')
  const [editFindings, setEditFindings] = useState('')
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    if (!reports || reports.length === 0) {
      setSelectedReport(null)
      return
    }
    if (selectedReport) {
      const refreshed = reports.find((report) => report.id === selectedReport.id)
      if (refreshed && refreshed !== selectedReport) {
        setSelectedReport(refreshed)
        return
      }
    } else if (reports.length > 0) {
      setSelectedReport(reports[0])
    }
  }, [reports, selectedReport, setSelectedReport])

  useEffect(() => {
    if (!selectedReport) return
    setIsEditing(false)
    setEditStatus(selectedReport.status)
    setEditRiskScore(String(selectedReport.risk_score))
    setEditFindings(selectedReport.key_findings ?? '')
    setEditError(null)
  }, [selectedReport])

  const handleSelectReport = (report: Report) => {
    setSelectedReport(report)
    setMobileView('detail')
  }

  const auditTrail = useMemo(() => {
    if (!selectedReport) return null
    const submittedBy = selectedReport.created_by_name || selectedReport.lead_inspector_name || 'System'
    const reviewedBy = selectedReport.reviewed_by_name || (selectedReport.status === 'completed' ? 'Pending' : '—')
    const lastEditedBy = selectedReport.last_edited_by_name || submittedBy
    return {
      submittedBy,
      submittedAt: selectedReport.created_at,
      reviewedBy,
      reviewedAt: selectedReport.reviewed_at,
      lastEditedBy,
      lastEditedAt: selectedReport.last_edited_at ?? selectedReport.updated_at,
    }
  }, [selectedReport])

  const handleSave = async () => {
    if (!selectedReport) return
    setEditError(null)

    const parsedRisk = Number(editRiskScore)
    if (Number.isNaN(parsedRisk) || parsedRisk < 0 || parsedRisk > 10) {
      setEditError('Risk score must be between 0 and 10.')
      return
    }

    try {
      await updateReport.mutateAsync({
        id: selectedReport.id,
        previousStatus: selectedReport.status,
        updates: {
          status: editStatus,
          risk_score: parsedRisk,
          key_findings: editFindings,
        },
      })
      setIsEditing(false)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to update report.')
    }
  }

  if (isLoading) {
    return <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-3xl shadow-xl h-80 animate-pulse border border-slate-100" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-3xl border border-red-100 text-red-600 font-bold uppercase tracking-wider text-center text-xs sm:text-sm">
        Telemetry Error: Reports Archive Unreachable
      </div>
    )
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-3xl border border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-center italic text-xs sm:text-sm">
        System Status: No technical logs on file for this site.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:gap-8 lg:grid-cols-[1.6fr_1fr] items-start">
      {/* 1. Log List (Compact) */}
      <div className={`bg-white p-4 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 flex flex-col transition-all duration-300 min-w-0 ${
        mobileView === 'detail' ? 'hidden lg:flex' : 'flex'
      }`}>
        <div className="flex items-center justify-between mb-6 px-1">
          <div>
            <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">Technical Logs</h3>
          </div>
          <div className="px-3 py-1 bg-slate-100 border border-slate-200/60 rounded-full text-xs font-semibold text-slate-600 uppercase tabular-nums">
            {reports.length} Units
          </div>
        </div>

        <div className="overflow-x-auto flex-1 min-h-[350px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th scope="col" className="text-left py-3.5 font-bold text-xs text-slate-600 uppercase tracking-wider pl-2">Designation</th>
                <th scope="col" className="text-right py-3.5 font-bold text-xs text-slate-600 uppercase tracking-wider pr-2">System Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {reports.map((report) => {
                const isSelected = selectedReport?.id === report.id
                return (
                  <tr
                    key={report.id}
                    className={`group cursor-pointer transition-all ${
                      isSelected ? 'bg-primary/[0.04]' : 'hover:bg-slate-50/70'
                    }`}
                    onClick={() => handleSelectReport(report)}
                  >
                    <td className="py-4 sm:py-5 pl-2">
                      <div className={`flex items-start gap-3 transition-all ${
                        isSelected ? 'border-l-4 border-primary pl-3' : 'pl-3 border-l-2 border-transparent'
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className={`font-bold uppercase tracking-tight leading-tight transition-colors text-xs sm:text-sm truncate ${
                            isSelected ? 'text-primary' : 'text-slate-900'
                          }`}>
                            {report.title}
                          </div>
                          <div className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-0.5">
                            {report.report_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 sm:py-5 text-right pr-2">
                      <div className="flex items-center justify-end gap-2.5">
                        <RiskScore score={report.risk_score} />
                        <div className={`transition-all duration-300 ${
                          isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                        }`}>
                          <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Detail View (Expanded) */}
      <div className={`bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 flex flex-col h-full min-h-[500px] transition-all duration-300 min-w-0 ${
        mobileView === 'list' ? 'hidden lg:flex' : 'flex'
      }`}>
        {selectedReport ? (
          <div className="space-y-6 sm:space-y-8 h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 px-1 gap-2 flex-wrap">
              <div className="flex items-center gap-2.5">
                <button 
                  onClick={() => setMobileView('list')}
                  className="lg:hidden min-w-11 min-h-11 flex items-center justify-center p-2 -ml-2 text-primary hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label="Back to technical logs list"
                >
                  <svg className="w-5 h-5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                <div className="hidden lg:block">
                  <svg className="w-5 h-5 text-primary/30 shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase mb-0.5">Detail View</h3>
                  <p className="text-xs text-slate-500 font-medium">{selectedReport.report_id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={!selectedReport}
                  onClick={onPrintSelected}
                  className="font-bold uppercase tracking-wider text-xs px-3.5 h-9 border-slate-200"
                >
                  Print Manifest
                </Button>
                {isEditing ? (
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as (typeof statusOptions)[number])}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-base sm:text-xs font-bold uppercase tracking-wide bg-white"
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                ) : (
                  <StatusBadge status={selectedReport.status} />
                )}
              </div>
            </div>

            <div className="flex-1 space-y-6 sm:space-y-8">
              <div>
                <h4 className="text-xl sm:text-2xl font-koulen text-black tracking-wide leading-tight mb-1">{selectedReport.title}</h4>
                <div className="text-xs font-bold text-primary uppercase tracking-wider">{selectedReport.project_name ?? 'UNIT_UNSPECIFIED'}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:gap-6 bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-100 shadow-inner">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date</div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 tabular-nums">{new Date(selectedReport.date).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Sector</div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{selectedReport.location}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Lead Node</div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{selectedReport.lead_inspector_name ?? 'SYSTEM'}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Intensity</div>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editRiskScore}
                      onChange={(event) => setEditRiskScore(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-base sm:text-xs font-bold bg-white tabular-nums"
                    />
                  ) : (
                    <RiskScore score={selectedReport.risk_score} />
                  )}
                </div>
              </div>

              <div className="space-y-2 px-1">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Technical Findings</div>
                {isEditing ? (
                  <textarea
                    value={editFindings}
                    onChange={(event) => setEditFindings(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base sm:text-sm font-medium text-slate-700 min-h-[120px] focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                ) : (
                  <p className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed italic whitespace-pre-line border-l-2 border-primary/30 pl-4 py-1 bg-slate-50/50 rounded-r-xl">
                    {selectedReport.key_findings || 'No formal observations recorded for this node.'}
                  </p>
                )}
              </div>

              {canViewAudit && auditTrail && (
                <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 sm:p-6 space-y-3">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Audit Trail</div>
                  <div className="space-y-2 text-xs font-medium text-slate-600">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-1.5">
                      <span className="uppercase tracking-wider font-bold text-slate-500">Submitted</span>
                      <span className="font-semibold text-slate-800">{auditTrail.submittedBy}</span>
                      <span className="text-slate-400 text-xs sm:text-right tabular-nums">
                        {new Date(auditTrail.submittedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-100 pb-1.5">
                      <span className="uppercase tracking-wider font-bold text-slate-500">Reviewed</span>
                      <span className="font-semibold text-slate-800">{auditTrail.reviewedBy}</span>
                      <span className="text-slate-400 text-xs sm:text-right tabular-nums">
                        {auditTrail.reviewedAt ? new Date(auditTrail.reviewedAt).toLocaleString() : '—'}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="uppercase tracking-wider font-bold text-slate-500">Last Edited</span>
                      <span className="font-semibold text-slate-800">{auditTrail.lastEditedBy}</span>
                      <span className="text-slate-400 text-xs sm:text-right tabular-nums">
                        {auditTrail.lastEditedAt ? new Date(auditTrail.lastEditedAt).toLocaleString() : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {editError && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-xs font-bold">
                  {editError}
                </div>
              )}

              {canEditReport && (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  {isEditing ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditing(false)}
                        disabled={updateReport.isPending}
                        className="min-h-[40px] text-xs font-bold uppercase px-4"
                      >
                        Cancel
                      </Button>
                      <Button type="button" onClick={handleSave} disabled={updateReport.isPending} className="min-h-[40px] text-xs font-bold uppercase px-4">
                        {updateReport.isPending ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(true)}
                      disabled={selectedReport.status === 'completed'}
                      className="min-h-[40px] text-xs font-bold uppercase px-4"
                    >
                      {selectedReport.status === 'completed' ? 'Completed' : 'Edit Log'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400 uppercase tracking-widest italic text-center leading-relaxed p-6">
            SELECT LOG ENTRY FOR DETAILED ANALYSIS
          </div>
        )}
      </div>

      <ReportModal report={modalReport} onClose={() => setModalReport(null)} />
    </div>
  )
}
