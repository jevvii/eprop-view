'use client'

import { useEffect, useMemo, useState } from 'react'
import { useProjects, useReports } from '@/app/lib/queries'
import { ReportForm } from '@/components/reports/report-form'
import { ReportsTable } from '@/components/reports/reports-table'
import { Button } from '@/components/ui/button'

export default function ReportsPage() {
  const { data: projects, isLoading, isError } = useProjects()
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const { data: reports, isLoading: reportsLoading, isError: reportsError } = useReports(projectId || undefined)

  const filteredReports = useMemo(() => {
    if (!reports) return []
    if (statusFilter === 'all') return reports
    return reports.filter(r => r.status === statusFilter)
  }, [reports, statusFilter])

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projectId, projects])

  const reportStats = useMemo(() => {
    const stats = { open: 0, in_review: 0, critical: 0, completed: 0 }
    reports?.forEach((report) => {
      if (report.status in stats) {
        stats[report.status as keyof typeof stats] += 1
      }
    })
    return stats
  }, [reports])

  const selectedProjectName = projects?.find((project) => project.id === projectId)?.name

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-40 animate-pulse m-8" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600 m-8 font-black uppercase tracking-widest text-center border border-red-100">
        Telemetry Error: Reports Unavailable
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-slate-500 m-8 font-bold uppercase tracking-widest text-center italic">
        System Status: No Projects Linked
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-73px)] lg:h-[calc(100vh-81px)] w-full overflow-hidden bg-brand-gray border-t border-slate-100">
      
      {/* 1. LEFT PANEL: Filters & Control */}
      <aside className="w-full lg:w-[320px] bg-white border-r border-slate-100 flex flex-col z-20 shadow-[10px_0_30px_rgba(0,0,0,0.02)]">
        <div className="p-8 space-y-10 overflow-y-auto custom-scrollbar flex-1">
          <div>
            <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase mb-1">Reports</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{selectedProjectName ?? 'SITE_UNSPECIFIED'}</p>
          </div>

          <div className="space-y-6 pt-4 border-t border-slate-50">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assigned Site</label>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Status Filter</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
              >
                <option value="all">ALL_RECORDS</option>
                <option value="open">OPEN_INCIDENTS</option>
                <option value="in_review">IN_REVIEW</option>
                <option value="critical">CRITICAL_RISK</option>
                <option value="completed">ARCHIVED_COMPLETE</option>
              </select>
            </div>

            <Button onClick={() => setIsCreateModalOpen(true)} className="w-full py-4 font-black uppercase tracking-[0.2em] text-[10px] h-auto shadow-xl shadow-primary/20">
              Add New Log
            </Button>
          </div>

          {/* Vertical Stats Stack */}
          <div className="space-y-4 pt-10 border-t border-slate-50">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active</span>
              <span className="text-lg font-koulen text-black">{reportStats.open}</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-50/30 border border-indigo-100/50 shadow-sm">
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Review</span>
              <span className="text-lg font-koulen text-indigo-700">{reportStats.in_review}</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-rose-50/30 border border-rose-100/50 shadow-sm">
              <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Critical</span>
              <span className="text-lg font-koulen text-rose-600">{reportStats.critical}</span>
            </div>
            <div className="flex items-center justify-between p-4 rounded-2xl bg-emerald-50/30 border border-emerald-100/50 shadow-sm">
              <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Complete</span>
              <span className="text-lg font-koulen text-emerald-600">{reportStats.completed}</span>
            </div>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100">
           <div className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] text-center">Technical Archives v2.4</div>
        </div>
      </aside>

      {/* 2. MAIN AREA: Data Table */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-10 custom-scrollbar">
        <ReportsTable reports={filteredReports} isLoading={reportsLoading} isError={reportsError} />
      </main>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white p-12 shadow-2xl overflow-y-auto max-h-[90vh] border border-slate-100">
            <ReportForm 
              projectId={projectId} 
              onClose={() => setIsCreateModalOpen(false)} 
            />
          </div>
        </div>
      )}
    </div>
  )
}
