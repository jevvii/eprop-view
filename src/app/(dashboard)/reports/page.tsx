'use client'

import { useEffect, useState } from 'react'
import { useProjects } from '@/app/lib/queries'
import { ReportForm } from '@/components/reports/report-form'
import { ReportsTable } from '@/components/reports/reports-table'

export default function ReportsPage() {
  const { data: projects, isLoading, isError } = useProjects()
  const [projectId, setProjectId] = useState('')

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projectId, projects])

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
          <p className="text-slate-500">Generate and review inspection reports across projects.</p>
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

      <ReportForm projectId={projectId} />
      <ReportsTable projectId={projectId} />
    </div>
  )
}
