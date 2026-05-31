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
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.8fr,1fr]">
      {/* 1. Main Table */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col">
        <div className="flex items-center justify-between mb-8 px-2">
          <div>
            <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Technical Logs</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Historical inspection data and risk registry.</p>
          </div>
          <div className="px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">
            {reports.length} Units Found
          </div>
        </div>

        <div className="overflow-x-auto flex-1 min-h-[400px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th scope="col" className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Designation</th>
                <th scope="col" className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Operation Date</th>
                <th scope="col" className="text-left py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Risk Protocol</th>
                <th scope="col" className="text-right py-4 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pr-2">System Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {reports.map((report) => {
                const isSelected = selectedReport?.id === report.id
                return (
                  <tr
                    key={report.id}
                    className={`group cursor-pointer transition-all ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
                    onClick={() => setSelectedReport(report)}
                  >
                    <td className="py-6 pl-2">
                      <div className={`font-black uppercase tracking-tight leading-tight transition-colors ${isSelected ? 'text-primary' : 'text-black'}`}>{report.title}</div>
                      <div className="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">{report.report_id}</div>
                    </td>
                    <td className="py-6 text-[11px] font-bold text-slate-600 uppercase tracking-tighter">
                      {new Date(report.date).toLocaleDateString()}
                    </td>
                    <td className="py-6">
                      <StatusBadge status={report.status} />
                    </td>
                    <td className="py-6 text-right pr-2">
                      <RiskScore score={report.risk_score} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Detail Sidebar */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col h-full sticky top-24">
        {selectedReport ? (
          <div className="space-y-8 h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-6 px-2">
              <div>
                <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Detail View</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{selectedReport.report_id}</p>
              </div>
              <StatusBadge status={selectedReport.status} />
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

            <div className="pt-8 border-t border-slate-100 flex flex-col gap-3">
              <Button onClick={() => setModalReport(selectedReport)} className="w-full py-4 font-black uppercase tracking-[0.2em] text-[10px] h-auto shadow-lg shadow-primary/10">
                Generate Full Manifest
              </Button>
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
