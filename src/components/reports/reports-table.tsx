'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Report } from '@/app/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { RiskScore } from '@/components/shared/risk-score'
import { Button } from '@/components/ui/button'
import { ReportModal } from './report-modal'
import { useUpdateReport } from '@/app/lib/mutations'

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
  const [modalReport, setModalReport] = useState<Report | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const updateReport = useUpdateReport()
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
    return <div className="bg-white p-10 rounded-[2.5rem] shadow-xl h-80 animate-pulse border border-slate-100" />
  }

  if (isError) {
    return (
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-red-100 text-red-600 font-bold uppercase tracking-widest text-center">
        Telemetry Error: Reports Archive Unreachable
      </div>
    )
  }

  if (!reports || reports.length === 0) {
    return (
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 text-slate-400 font-bold uppercase tracking-widest text-center italic">
        System Status: No technical logs on file for this site.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
      {/* 1. Log List (Compact) */}
      <div className={`bg-white p-6 lg:p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col transition-all duration-300 ${
        mobileView === 'detail' ? 'hidden lg:flex' : 'flex'
      }`}>
        <div className="flex items-center justify-between mb-8 px-2">
          <div>
            <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Technical Logs</h3>
          </div>
          <div className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">
            {reports.length} Units
          </div>
        </div>

        <div className="overflow-x-auto flex-1 min-h-[400px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th scope="col" className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Designation</th>
                <th scope="col" className="text-right py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pr-2">System Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {reports.map((report) => {
                const isSelected = selectedReport?.id === report.id
                return (
                  <tr
                    key={report.id}
                    className={`group cursor-pointer transition-all ${
                      isSelected ? 'bg-primary/[0.03]' : 'hover:bg-slate-50/50'
                    }`}
                    onClick={() => handleSelectReport(report)}
                  >
                    <td className="py-6 pl-2">
                      <div className={`flex items-start gap-4 transition-all ${
                        isSelected ? 'border-l-4 border-primary pl-4 scale-[1.01]' : 'pl-3 border-l-2 border-transparent'
                      }`}>
                        <div className="flex-1">
                          <div className={`font-black uppercase tracking-tight leading-tight transition-colors ${
                            isSelected ? 'text-primary' : 'text-black'
                          }`}>
                            {report.title}
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">
                            {report.report_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-6 text-right pr-2">
                      <div className="flex items-center justify-end gap-3">
                        <RiskScore score={report.risk_score} />
                        <div className={`transition-all duration-300 ${
                          isSelected ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
                        }`}>
                          <svg className="w-5 h-5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
      <div className={`bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col h-full min-h-[600px] transition-all duration-300 ${
        mobileView === 'list' ? 'hidden lg:flex' : 'flex'
      }`}>
        {selectedReport ? (
          <div className="space-y-8 h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-6 px-2">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setMobileView('list')}
                  className="lg:hidden p-2 -ml-2 text-primary hover:bg-slate-50 rounded-full transition-colors"
                  aria-label="Back to List"
                >
                  <svg className="w-5 h-5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                <div className="hidden lg:block">
                  <svg className="w-5 h-5 text-primary/30 shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Detail View</h3>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{selectedReport.report_id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  disabled={!selectedReport}
                  onClick={onPrintSelected}
                  className="font-black uppercase tracking-[0.2em] text-[9px] px-4 h-9 border-slate-200"
                >
                  Print Manifest
                </Button>
                {isEditing ? (
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as (typeof statusOptions)[number])}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-[0.15em] bg-white"
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

            <div className="flex-1 space-y-8">
              <div>
                <h4 className="text-xl font-koulen text-black tracking-wide leading-tight mb-1">{selectedReport.title}</h4>
                <div className="text-[9px] font-black text-primary uppercase tracking-[0.2em]">{selectedReport.project_name ?? 'UNIT_UNSPECIFIED'}</div>
              </div>

              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-inner">
                <div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Date</div>
                  <div className="text-xs font-black text-black">{new Date(selectedReport.date).toLocaleDateString()}</div>
                </div>
                <div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Sector</div>
                  <div className="text-xs font-black text-black truncate">{selectedReport.location}</div>
                </div>
                <div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Lead Node</div>
                  <div className="text-xs font-black text-black truncate">{selectedReport.lead_inspector_name ?? 'SYSTEM'}</div>
                </div>
                <div>
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Intensity</div>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={editRiskScore}
                      onChange={(event) => setEditRiskScore(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold bg-white"
                    />
                  ) : (
                    <RiskScore score={selectedReport.risk_score} />
                  )}
                </div>
              </div>

              <div className="space-y-3 px-2">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Technical Findings</div>
                {isEditing ? (
                  <textarea
                    value={editFindings}
                    onChange={(event) => setEditFindings(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 min-h-[120px] focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                ) : (
                  <p className="text-[11px] font-bold text-slate-600 leading-relaxed italic whitespace-pre-line border-l-2 border-primary/20 pl-4 py-1">
                    {selectedReport.key_findings || 'No formal observations recorded for this node.'}
                  </p>
                )}
              </div>

              {auditTrail && (
                <div className="bg-slate-50/70 border border-slate-100 rounded-3xl p-6 space-y-4">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Audit Trail</div>
                  <div className="grid grid-cols-1 gap-3 text-[11px] font-bold text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="uppercase tracking-widest text-[9px] text-slate-400">Submitted</span>
                      <span>{auditTrail.submittedBy}</span>
                      <span className="text-[9px] text-slate-400">
                        {new Date(auditTrail.submittedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="uppercase tracking-widest text-[9px] text-slate-400">Reviewed</span>
                      <span>{auditTrail.reviewedBy}</span>
                      <span className="text-[9px] text-slate-400">
                        {auditTrail.reviewedAt ? new Date(auditTrail.reviewedAt).toLocaleString() : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="uppercase tracking-widest text-[9px] text-slate-400">Last Edited</span>
                      <span>{auditTrail.lastEditedBy}</span>
                      <span className="text-[9px] text-slate-400">
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

              <div className="flex flex-wrap items-center justify-end gap-2">
                {isEditing ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEditing(false)}
                      disabled={updateReport.isPending}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={updateReport.isPending}>
                      {updateReport.isPending ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    disabled={selectedReport.status === 'completed'}
                  >
                    {selectedReport.status === 'completed' ? 'Completed' : 'Edit Log'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] font-black text-slate-300 uppercase tracking-widest italic text-center leading-relaxed">
            SELECT_LOG_ENTRY<br/>FOR_DETAILED_ANALYSIS
          </div>
        )}
      </div>

      <ReportModal report={modalReport} onClose={() => setModalReport(null)} />
    </div>
  )
}
