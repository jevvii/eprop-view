'use client'

import { useEffect, useMemo, useState } from 'react'
import { useProjects, useReports } from '@/app/lib/queries'
import { ReportForm } from '@/components/reports/report-form'
import { ReportsTable } from '@/components/reports/reports-table'

export default function ReportsPage() {
  const { data: projects, isLoading, isError } = useProjects()
  const [projectId, setProjectId] = useState('')
  const { data: reports, isLoading: reportsLoading, isError: reportsError } = useReports(projectId || undefined)

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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Reports</h2>
          <p className="text-slate-500">
            {selectedProjectName ? `Reports · ${selectedProjectName}` : 'Generate and review inspection reports.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600">Project</label>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white p-4 shadow-lg">
          <div className="text-xs font-semibold text-slate-500">Total Open Reports</div>
          <div className="text-2xl font-bold text-slate-900">{reportStats.open}</div>
        </div>
        <div className="rounded-2xl bg-blue-50 p-4 shadow-lg">
          <div className="text-xs font-semibold text-blue-700">Reports In Review</div>
          <div className="text-2xl font-bold text-blue-900">{reportStats.in_review}</div>
        </div>
        <div className="rounded-2xl bg-red-50 p-4 shadow-lg">
          <div className="text-xs font-semibold text-red-700">Critical Risk Reports</div>
          <div className="text-2xl font-bold text-red-900">{reportStats.critical}</div>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-4 shadow-lg">
          <div className="text-xs font-semibold text-emerald-700">Completed Reports</div>
          <div className="text-2xl font-bold text-emerald-900">{reportStats.completed}</div>
        </div>
      </div>

      <ReportForm projectId={projectId} />
      <ReportsTable reports={reports} isLoading={reportsLoading} isError={reportsError} />
    </div>
  )
}
