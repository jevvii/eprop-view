'use client'

import { useMemo, useState } from 'react'
import { useInspections, useProjects, useReports, useStaffProfiles } from '@/app/lib/queries'
import { StatusBadge } from '@/components/shared/status-badge'

export function ProjectGrid() {
  const { data: projects, isLoading, isError } = useProjects()
  const { data: inspections } = useInspections()
  const { data: reports } = useReports()
  const { data: staff } = useStaffProfiles()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredProjects = useMemo(() => {
    if (!projects) return []
    if (statusFilter === 'all') return projects
    return projects.filter(p => p.status === statusFilter)
  }, [projects, statusFilter])

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
          <div key={index} className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm h-64 animate-pulse border border-slate-100" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-red-100 text-red-600 font-bold uppercase tracking-wider text-center text-xs sm:text-sm">
        Telemetry Error: Database unreachable.
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-center italic text-xs sm:text-sm">
        System Status: No active projects on file.
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-100 shadow-xs w-full sm:w-fit">
        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide pl-2">Filter State</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-3.5 py-2 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all flex-1 sm:flex-initial"
        >
          <option value="all">ALL_PROJECTS</option>
          <option value="active">ACTIVE_MONITORING</option>
          <option value="completed">ARCHIVED_COMPLETE</option>
          <option value="on_hold">SUSPENDED</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredProjects.map((project) => {
          const inspectionsCount = inspectionCounts.get(project.id) ?? 0
          const reportsCount = reportCounts.get(project.id) ?? 0
          const criticalCount = criticalReportCounts.get(project.id) ?? 0
          const lastInspection = latestInspectionDate.get(project.id)

          return (
            <div key={project.id} className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-md sm:shadow-lg border border-slate-100 flex flex-col group hover:shadow-xl transition-all duration-300 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xl sm:text-2xl font-koulen text-black tracking-wide leading-tight mb-1 group-hover:text-primary transition-colors truncate">{project.name}</h3>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">{project.location}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              
              <p className="text-xs sm:text-sm font-medium text-slate-600 mb-6 leading-relaxed flex-1 italic">
                {project.description || 'No detailed technical overview provided for this designated unit.'}
              </p>

              <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-6">
                <div className="flex flex-col">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Inspections</div>
                  <div className="text-xl sm:text-2xl font-koulen text-black tabular-nums">{inspectionsCount}</div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Reports</div>
                  <div className="text-xl sm:text-2xl font-koulen text-black tabular-nums">{reportsCount}</div>
                </div>
                <div className="flex flex-col">
                  <div className="text-xs font-semibold text-rose-500 uppercase tracking-wider mb-1">Critical</div>
                  <div className="text-xl sm:text-2xl font-koulen text-rose-600 tabular-nums">{criticalCount}</div>
                </div>
              </div>

              <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col gap-2">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Assigned Project Team & Engineers
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {staff && staff.length > 0 ? (
                    staff.map((member) => (
                      <span
                        key={member.id}
                        className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold uppercase tracking-wider border ${
                          member.role === 'engineer'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : member.role === 'admin'
                            ? 'bg-slate-100 text-slate-700 border-slate-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                        title={`${member.full_name} (${member.department || member.role})`}
                      >
                        {member.full_name} ({member.role.toUpperCase()})
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-medium text-slate-500">No team assigned</span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between pt-2">
                <div className="text-xs font-medium text-slate-500">
                  Last inspection:{' '}
                  <span className="text-slate-800 font-semibold">
                    {lastInspection ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(lastInspection)) : 'None yet'}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
