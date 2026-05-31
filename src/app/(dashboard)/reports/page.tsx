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
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-40 animate-pulse" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load reports
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-slate-500">
        Add a project to start creating reports.
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-2">
        <div>
          <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Inspection Reports</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {selectedProjectName ? `Reports Archive · ${selectedProjectName}` : 'Generate and review technical inspection logs.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Filter Site</label>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            >
              <option value="all">ALL_STATUS</option>
              <option value="open">OPEN</option>
              <option value="in_review">IN_REVIEW</option>
              <option value="critical">CRITICAL</option>
              <option value="completed">COMPLETED</option>
            </select>
          </div>

          <Button onClick={() => setIsCreateModalOpen(true)} className="font-black uppercase tracking-[0.2em] text-[10px] px-8 h-12 shadow-lg shadow-primary/20">
            Add New Log
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[2rem] bg-white p-6 shadow-xl border border-slate-100 group hover:shadow-2xl transition-all">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Active Logs</div>
          <div className="text-4xl font-koulen text-black">{reportStats.open}</div>
        </div>
        <div className="rounded-[2rem] bg-indigo-50/50 p-6 shadow-xl border border-indigo-100 group hover:shadow-2xl transition-all">
          <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Pending Review</div>
          <div className="text-4xl font-koulen text-indigo-700">{reportStats.in_review}</div>
        </div>
        <div className="rounded-[2rem] bg-rose-50/50 p-6 shadow-xl border border-rose-100 group hover:shadow-2xl transition-all">
          <div className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-2">Critical Priority</div>
          <div className="text-4xl font-koulen text-rose-600">{reportStats.critical}</div>
        </div>
        <div className="rounded-[2rem] bg-emerald-50/50 p-6 shadow-xl border border-emerald-100 group hover:shadow-2xl transition-all">
          <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">Verified Complete</div>
          <div className="text-4xl font-koulen text-emerald-600">{reportStats.completed}</div>
        </div>
      </div>

      <ReportsTable reports={filteredReports} isLoading={reportsLoading} isError={reportsError} />

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
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
