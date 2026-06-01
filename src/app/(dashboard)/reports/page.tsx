'use client'

import { useEffect, useMemo, useState } from 'react'
import { useProjects, useReports, useProfile } from '@/app/lib/queries'
import { PrintReport } from '@/components/reports/print-report'
import { ReportForm } from '@/components/reports/report-form'
import { ReportsTable } from '@/components/reports/reports-table'
import { Button } from '@/components/ui/button'
import type { Report } from '@/app/types'

export default function ReportsPage() {
  const { data: projects, isLoading, isError } = useProjects()
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [printMode, setPrintMode] = useState<'single' | 'full'>('single')
  const { data: profile } = useProfile()
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
  const hasReports = filteredReports.length > 0

  const handlePrintAll = () => {
    setPrintMode('full')
    setTimeout(() => window.print(), 100)
  }

  const handlePrintSelected = () => {
    setPrintMode('single')
    setTimeout(() => window.print(), 100)
  }

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
    <>
      {/* ── Screen UI ── */}
      <div className="space-y-10 no-print">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between px-2">
          <div>
            <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Inspection Reports</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              {selectedProjectName ? `Reports Archive · ${selectedProjectName}` : 'Generate and review technical inspection logs.'}
            </p>
          </div>
          
          {/* Actions Container - Single Line on Desktop */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-100 shadow-sm">
              <label className="hidden sm:block text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Site</label>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all max-w-[150px] truncate"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-100 shadow-sm">
              <label className="hidden sm:block text-[9px] font-black text-slate-400 uppercase tracking-widest pl-2">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              >
                <option value="all">ALL</option>
                <option value="open">OPEN</option>
                <option value="in_review">REVIEW</option>
                <option value="critical">CRITICAL</option>
                <option value="completed">DONE</option>
              </select>
            </div>

            <Button
              variant="outline"
              disabled={!hasReports}
              onClick={handlePrintAll}
              className="font-black uppercase tracking-[0.2em] text-[9px] px-4 h-10 border-slate-200"
            >
              Print All
            </Button>

            <Button 
              onClick={() => setIsCreateModalOpen(true)} 
              className="font-black uppercase tracking-[0.2em] text-[9px] px-6 h-10 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-white"
            >
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

        <ReportsTable 
          reports={filteredReports} 
          isLoading={reportsLoading} 
          isError={reportsError} 
          selectedReport={selectedReport}
          setSelectedReport={setSelectedReport}
          onPrintSelected={handlePrintSelected}
        />
      </div>

      {/* ── Print-only content (outside space-y-10 flow) ── */}
      <div className="print-only">
        <PrintReport
          reports={filteredReports}
          projectName={selectedProjectName ?? 'All Projects'}
          generatedBy={profile?.full_name ?? profile?.email ?? 'System'}
          stats={reportStats}
          selectedReport={printMode === 'single' ? selectedReport : null}
        />
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <ReportForm
              projectId={projectId}
              onClose={() => setIsCreateModalOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
