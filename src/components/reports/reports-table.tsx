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
  selectedReport: Report | null
  setSelectedReport: (report: Report | null) => void
  onPrintSelected: () => void
}

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

  useEffect(() => {
    if (!reports || reports.length === 0) {
      setSelectedReport(null)
      return
    }
    if (!selectedReport && reports.length > 0) {
      setSelectedReport(reports[0])
    }
  }, [reports, selectedReport, setSelectedReport])

  const handleSelectReport = (report: Report) => {
    setSelectedReport(report)
    setMobileView('detail')
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
                <StatusBadge status={selectedReport.status} />
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
                  <RiskScore score={selectedReport.risk_score} />
                </div>
              </div>

              <div className="space-y-3 px-2">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Technical Findings</div>
                <p className="text-[11px] font-bold text-slate-600 leading-relaxed italic whitespace-pre-line border-l-2 border-primary/20 pl-4 py-1">
                  {selectedReport.key_findings || 'No formal observations recorded for this node.'}
                </p>
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
