'use client'

import type { Report } from '@/app/types'
import { RiskScore } from '@/components/shared/risk-score'

interface PrintReportProps {
  reports: Report[]
  projectName: string
  generatedBy: string
  stats: {
    open: number
    in_review: number
    critical: number
    completed: number
  }
  selectedReport?: Report | null
}

export function PrintReport({ reports, projectName, generatedBy, stats, selectedReport }: PrintReportProps) {
  const isSingle = !!selectedReport
  const displayReports = selectedReport ? [selectedReport] : reports
  const total = displayReports.length
  
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className="print-report font-sans text-black bg-white p-0">
      {/* ── Page Header (Repeats on every page) ── */}
      <div className="border-b-4 border-black pb-6 mb-10 flex justify-between items-end">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 flex items-center justify-center">
            <img
              src="/logo-blue.png"
              alt="EPROP View logo"
              className="h-14 w-14 object-contain"
            />
          </div>
          <div>
            <h1 className="text-4xl font-koulen tracking-tight leading-none text-black">EPROP VIEW</h1>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1.5">Technical Intelligence Protocol</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Document Classification</div>
          <div className="px-3 py-1 bg-black text-white text-[9px] font-black uppercase tracking-[0.2em] inline-block">Proprietary / Internal Use Only</div>
        </div>
      </div>

      {/* ── Report Identification ── */}
      <div className="mb-12">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">
              {isSingle ? 'Individual Asset Inspection Report' : 'Technical Inspection Registry'}
            </h2>
            <div className="flex items-center gap-6 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <div><span className="text-slate-400">Project:</span> <span className="text-black">{projectName}</span></div>
              <div><span className="text-slate-400">Node:</span> <span className="text-black">{generatedBy}</span></div>
              <div><span className="text-slate-400">Units:</span> <span className="text-black">{total}</span></div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Generation Timestamp</div>
            <div className="text-sm font-black">{now}</div>
          </div>
        </div>
      </div>

      {/* ── Summary Metrics (Only for registry) ── */}
      {!isSingle && (
        <div className="grid grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Active Logs', value: stats.open, color: 'text-black' },
            { label: 'Pending Review', value: stats.in_review, color: 'text-indigo-700' },
            { label: 'Critical Alert', value: stats.critical, color: 'text-red-600' },
            { label: 'Verified Complete', value: stats.completed, color: 'text-emerald-600' },
          ].map((stat, i) => (
            <div key={i} className="border-t-2 border-slate-100 pt-4">
              <div className="text-[8px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{stat.label}</div>
              <div className={`text-3xl font-koulen ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Registry Table (Only for registry) ── */}
      {!isSingle && (
        <div className="mb-12">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-[9px] font-black uppercase tracking-widest">
                <th className="py-3 pr-4">ID</th>
                <th className="py-3 pr-4">Designation</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Timestamp</th>
                <th className="py-3 pr-4">Sector</th>
                <th className="py-3 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map((report) => (
                <tr key={report.id} className="text-[10px] font-medium border-b border-slate-50">
                  <td className="py-3 font-bold text-slate-400">{report.report_id}</td>
                  <td className="py-3 font-black uppercase tracking-tight text-black">{report.title}</td>
                  <td className="py-3 uppercase font-black text-[8px] tracking-widest">{report.status.replace('_', ' ')}</td>
                  <td className="py-3 text-slate-600">{new Date(report.date).toLocaleDateString()}</td>
                  <td className="py-3 text-slate-600 uppercase">{report.location}</td>
                  <td className="py-3 text-right">
                    <span className="font-black text-black">{(report.risk_score).toFixed(1)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Detailed Findings ── */}
      <div className="space-y-12">
        {displayReports.map((report) => (
          <div key={report.id} className="avoid-break page-break-before-auto">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-[1px] flex-1 bg-slate-100" />
              <div className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em]">Section Detail: {report.report_id}</div>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>

            <div className="grid grid-cols-[1fr,250px] gap-10">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter mb-4 text-black">{report.title}</h3>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-6">
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-3">Technical Observations & Analysis</div>
                  <p className="text-[11px] leading-relaxed text-slate-700 font-medium whitespace-pre-line text-justify italic border-l-2 border-black/10 pl-5">
                    {report.key_findings || 'No formal observations recorded for this node.'}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-4">Metric Assessment</div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-[8px] text-slate-400 font-bold uppercase mb-1">Risk Intensity</div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-black" 
                            style={{ width: `${(report.risk_score / 10) * 100}%` }} 
                          />
                        </div>
                        <span className="text-xs font-black">{report.risk_score.toFixed(1)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] text-slate-400 font-bold uppercase mb-1">Status Protocol</div>
                      <div className="text-[10px] font-black uppercase tracking-widest border border-black px-2 py-1 inline-block">
                        {report.status}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-5 space-y-3">
                  <div>
                    <div className="text-[7px] text-slate-400 font-black uppercase tracking-widest">Sector Code</div>
                    <div className="text-[10px] font-bold text-black uppercase">{report.location}</div>
                  </div>
                  <div>
                    <div className="text-[7px] text-slate-400 font-black uppercase tracking-widest">Inspector ID</div>
                    <div className="text-[10px] font-bold text-black uppercase">{report.lead_inspector_name ?? 'NODE_UNSPECIFIED'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer / Validation ── */}
      <div className="mt-20 pt-10 border-t border-slate-100">
        <div className="grid grid-cols-3 gap-10">
          <div className="col-span-2">
            <p className="text-[8px] text-slate-400 font-bold leading-relaxed uppercase tracking-widest text-justify">
              Certification of Accuracy: This technical inspection log has been generated and validated by the EPROP VIEW protocols. All risk assessments are based on the latest geospatial and environmental data feeds available at the time of generation. This document is a formal record of asset condition.
            </p>
          </div>
          <div className="text-right space-y-4">
            <div className="inline-block border-b border-black w-40 h-10" />
            <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Authorized Signature</div>
          </div>
        </div>
      </div>
    </div>
  )
}
