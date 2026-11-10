'use client'

import type { Report } from '@/app/types'
import { RiskScore } from '@/components/shared/risk-score'
import { useAIDetectionsForInspection, useARAnchors } from '@/app/lib/queries'

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

function ReportAIDetails({ inspectionId }: { inspectionId: string }) {
  const { data: detections = [] } = useAIDetectionsForInspection(inspectionId)
  const { data: anchors = [] } = useARAnchors(inspectionId)

  if (detections.length === 0 && anchors.length === 0) {
    return null
  }

  return (
    <div className="space-y-4 mb-6">
      {detections.length > 0 && (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              Automated AI Structural Damage Diagnostics
            </div>
            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider tabular-nums">
              {detections.length} Detections Logged
            </div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {detections.map((det) => (
              <div key={det.id} className="bg-white p-3 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold uppercase tracking-tight text-black flex items-center gap-1.5">
                    <span>{det.damage_type}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      det.severity === 'critical' ? 'bg-red-100 text-red-700' :
                      det.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                      det.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {det.severity}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5 tabular-nums">
                    Score: {det.severity_score.toFixed(0)}/100 · Conf: {(det.confidence * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-bold uppercase px-2 py-1 rounded-md ${
                    det.verified_by ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-50 text-slate-400'
                  }`}>
                    {det.verified_by ? 'Verified' : 'Unverified'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {anchors.length > 0 && (
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-indigo-600" />
            AR Spatial Anchors & Telemetry (<span className="tabular-nums">{anchors.length}</span>)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {anchors.map((anchor) => (
              <div key={anchor.id} className="bg-white p-3 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold uppercase text-black">{anchor.label}</span>
                  <span className="text-xs font-bold text-slate-500 uppercase">{anchor.damage_type ?? 'structural'}</span>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500">
                  Pose: [{anchor.pose.position.x.toFixed(2)}, {anchor.pose.position.y.toFixed(2)}, {anchor.pose.position.z.toFixed(2)}]
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1.5">Technical Intelligence Protocol</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Document Classification</div>
          <div className="px-3 py-1 bg-black text-white text-xs font-bold uppercase tracking-wider inline-block">Proprietary / Internal Use Only</div>
        </div>
      </div>

      {/* ── Report Identification ── */}
      <div className="mb-12">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">
              {isSingle ? 'Individual Asset Inspection Report' : 'Technical Inspection Registry'}
            </h2>
            <div className="flex items-center gap-6 text-xs font-bold text-slate-600 uppercase tracking-wider">
              <div><span className="text-slate-500">Project:</span> <span className="text-black">{projectName}</span></div>
              <div><span className="text-slate-500">Node:</span> <span className="text-black">{generatedBy}</span></div>
              <div><span className="text-slate-500">Units:</span> <span className="text-black tabular-nums">{total}</span></div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Generation Timestamp</div>
            <div className="text-sm font-bold tabular-nums">{now}</div>
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
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{stat.label}</div>
              <div className={`text-3xl font-koulen tabular-nums ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Registry Table (Only for registry) ── */}
      {!isSingle && (
        <div className="mb-12">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-xs font-bold uppercase tracking-wider">
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
                <tr key={report.id} className="text-xs font-medium border-b border-slate-50">
                  <td className="py-3 font-bold text-slate-500">{report.report_id}</td>
                  <td className="py-3 font-bold uppercase tracking-tight text-black">{report.title}</td>
                  <td className="py-3 uppercase font-bold text-xs tracking-wider">{report.status.replace('_', ' ')}</td>
                  <td className="py-3 text-slate-600 tabular-nums">{new Date(report.date).toLocaleDateString()}</td>
                  <td className="py-3 text-slate-600 uppercase">{report.location}</td>
                  <td className="py-3 text-right">
                    <span className="font-bold text-black tabular-nums">{(report.risk_score).toFixed(1)}</span>
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
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Section Detail: {report.report_id}</div>
              <div className="h-[1px] flex-1 bg-slate-100" />
            </div>

            <div className="grid grid-cols-[1fr_250px] gap-10">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tighter mb-4 text-black">{report.title}</h3>
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-6">
                  <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Technical Observations & Analysis</div>
                  <p className="text-xs leading-relaxed text-slate-700 font-medium whitespace-pre-line text-justify italic border-l-2 border-black/10 pl-5">
                    {report.key_findings || 'No formal observations recorded for this node.'}
                  </p>
                </div>
                {report.inspection_id && <ReportAIDetails inspectionId={report.inspection_id} />}
              </div>

              <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-4">Metric Assessment</div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs text-slate-500 font-bold uppercase mb-1">Risk Intensity</div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-black" 
                            style={{ width: `${(report.risk_score / 10) * 100}%` }} 
                          />
                        </div>
                        <span className="text-xs font-bold tabular-nums">{report.risk_score.toFixed(1)}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 font-bold uppercase mb-1">Status Protocol</div>
                      <div className="text-xs font-bold uppercase tracking-wider border border-black px-2.5 py-1 inline-block">
                        {report.status}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-5 space-y-3">
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sector Code</div>
                    <div className="text-xs font-bold text-black uppercase">{report.location}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Inspector ID</div>
                    <div className="text-xs font-bold text-black uppercase">{report.lead_inspector_name ?? 'NODE_UNSPECIFIED'}</div>
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
            <p className="text-xs text-slate-500 font-medium leading-relaxed uppercase tracking-wider text-justify">
              Certification of Accuracy: This technical inspection log has been generated and validated by the EPROP VIEW protocols. All risk assessments are based on the latest geospatial and environmental data feeds available at the time of generation. This document is a formal record of asset condition.
            </p>
          </div>
          <div className="text-right space-y-4">
            <div className="inline-block border-b border-black w-40 h-10" />
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600">Authorized Signature</div>
          </div>
        </div>
      </div>
    </div>
  )
}
