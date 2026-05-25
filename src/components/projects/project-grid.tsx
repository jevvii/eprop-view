'use client'

import { useMemo } from 'react'
import { useInspections, useProjects, useReports } from '@/app/lib/queries'
import { StatusBadge } from '@/components/shared/status-badge'

export function ProjectGrid() {
  const { data: projects, isLoading, isError } = useProjects()
  const { data: inspections } = useInspections()
  const { data: reports } = useReports()

  const inspectionCounts = useMemo(() => {
    const map = new Map<string, number>()
    inspections?.forEach((inspection) => {
      map.set(inspection.project_id, (map.get(inspection.project_id) ?? 0) + 1)
    })
    return map
  }, [inspections])

  const reportCounts = useMemo(() => {
    const map = new Map<string, number>()
    reports?.forEach((report) => {
      map.set(report.project_id, (map.get(report.project_id) ?? 0) + 1)
    })
    return map
  }, [reports])

  const criticalReportCounts = useMemo(() => {
    const map = new Map<string, number>()
    reports?.forEach((report) => {
      if (report.status === 'critical') {
        map.set(report.project_id, (map.get(report.project_id) ?? 0) + 1)
      }
    })
    return map
  }, [reports])

  const latestInspectionDate = useMemo(() => {
    const map = new Map<string, string>()
    inspections?.forEach((inspection) => {
      const existing = map.get(inspection.project_id)
      if (!existing || new Date(inspection.inspection_date) > new Date(existing)) {
        map.set(inspection.project_id, inspection.inspection_date)
      }
    })
    return map
  }, [inspections])

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-white p-6 rounded-2xl shadow-lg h-48 animate-pulse" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load projects
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-slate-500">
        No projects available yet.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const inspectionsCount = inspectionCounts.get(project.id) ?? 0
        const reportsCount = reportCounts.get(project.id) ?? 0
        const criticalCount = criticalReportCounts.get(project.id) ?? 0
        const lastInspection = latestInspectionDate.get(project.id)

        return (
          <div key={project.id} className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{project.name}</h3>
                <p className="text-sm text-slate-500">{project.location}</p>
              </div>
              <StatusBadge status={project.status} />
            </div>
            <p className="text-sm text-slate-600 mb-4 min-h-[3.5rem]">
              {project.description || 'No description provided for this project.'}
            </p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-500">Inspections</div>
                <div className="text-lg font-bold text-slate-900">{inspectionsCount}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-500">Reports</div>
                <div className="text-lg font-bold text-slate-900">{reportsCount}</div>
              </div>
              <div className="rounded-xl bg-rose-50 p-3">
                <div className="text-xs font-semibold text-rose-600">Critical</div>
                <div className="text-lg font-bold text-rose-700">{criticalCount}</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-400">
              Last inspection: {lastInspection ? new Date(lastInspection).toLocaleDateString() : 'Not yet scheduled'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
