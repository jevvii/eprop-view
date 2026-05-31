'use client'

import { useMemo, useState } from 'react'
import { useInspections, useProjects, useReports } from '@/app/lib/queries'
import { StatusBadge } from '@/components/shared/status-badge'

export function ProjectGrid() {
  const { data: projects, isLoading, isError } = useProjects()
  const { data: inspections } = useInspections()
  const { data: reports } = useReports()
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
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="bg-white p-10 rounded-[2.5rem] shadow-xl h-64 animate-pulse border border-slate-100" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-red-100 text-red-600 font-black uppercase tracking-widest text-center">
        Telemetry Error: Database unreachable.
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 text-slate-400 font-bold uppercase tracking-widest text-center italic">
        System Status: No active projects on file.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-fit">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Filter State</label>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        >
          <option value="all">ALL_PROJECTS</option>
          <option value="active">ACTIVE_MONITORING</option>
          <option value="completed">ARCHIVED_COMPLETE</option>
          <option value="on_hold">SUSPENDED</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
        {filteredProjects.map((project) => {
          const inspectionsCount = inspectionCounts.get(project.id) ?? 0
          const reportsCount = reportCounts.get(project.id) ?? 0
          const criticalCount = criticalReportCounts.get(project.id) ?? 0
          const lastInspection = latestInspectionDate.get(project.id)

          return (
            <div key={project.id} className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col group hover:shadow-2xl transition-all duration-300">
              <div className="flex items-start justify-between gap-6 mb-8">
                <div>
                  <h3 className="text-xl font-koulen text-black tracking-wide leading-none mb-1 group-hover:text-primary transition-colors">{project.name}</h3>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{project.location}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>
              
              <p className="text-[11px] font-bold text-slate-600 mb-10 leading-relaxed flex-1 italic">
                {project.description || 'No detailed technical overview provided for this designated unit.'}
              </p>

              <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-8">
                <div className="flex flex-col">
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Inspections</div>
                  <div className="text-2xl font-koulen text-black">{inspectionsCount}</div>
                </div>
                <div className="flex flex-col">
                  <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Reports</div>
                  <div className="text-2xl font-koulen text-black">{reportsCount}</div>
                </div>
                <div className="flex flex-col">
                  <div className="text-[8px] font-black text-rose-400 uppercase tracking-widest mb-1.5">Critical</div>
                  <div className="text-2xl font-koulen text-rose-600">{criticalCount}</div>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">
                  Last Telemetry: <span className="text-black">{lastInspection ? new Date(lastInspection).toLocaleDateString() : 'INITIAL_SCAN'}</span>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
