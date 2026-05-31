'use client'

import { useEffect, useMemo, useState } from 'react'
import { useProjects, useRiskHotspots } from '@/app/lib/queries'
import { EnvMap } from '@/components/environmental/env-map'
import { AnalysisPanel } from '@/components/environmental/analysis-panel'
import { StatusBadge } from '@/components/shared/status-badge'

export default function EnvironmentalPage() {
  const { data: projects, isLoading, isError } = useProjects()
  const [projectId, setProjectId] = useState('')
  const { data: hotspots } = useRiskHotspots(projectId || undefined)

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projectId, projects])

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === projectId),
    [projects, projectId]
  )

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-40 animate-pulse" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load projects for environmental view
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-slate-500">
        Add a project to begin environmental analysis.
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-2">
        <div>
          <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Environmental Risk Assessment</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Analyze hazard zones and update site suitability scores.</p>
        </div>
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Current Project</label>
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
      </div>

      {projectId && (
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.8fr_1fr]">
          <EnvMap
            projectId={projectId}
            center={
              selectedProject?.longitude && selectedProject?.latitude
                ? [selectedProject.longitude, selectedProject.latitude]
                : undefined
            }
          />
          <AnalysisPanel projectId={projectId} />
        </div>
      )}

      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100">
        <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-8 ml-2">Sector Risk Hotspots</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hotspots && hotspots.length > 0 ? (
            hotspots.slice(0, 6).map((hotspot) => (
              <div key={hotspot.id} className="flex flex-col gap-4 rounded-3xl border border-slate-100 p-6 bg-slate-50/50 hover:bg-white hover:shadow-lg transition-all group">
                <div className="flex justify-between items-start">
                  <div className="text-xs font-black text-black uppercase tracking-tight group-hover:text-primary transition-colors">{hotspot.title}</div>
                  <StatusBadge status={hotspot.severity} />
                </div>
                <div className="text-[10px] text-slate-500 font-bold leading-relaxed line-clamp-2">{hotspot.description || 'No detailed analysis provided for this sector.'}</div>
              </div>
            ))
          ) : (
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest italic ml-2">No active hotspots recorded for this project.</p>
          )}
        </div>
      </div>
    </div>
  )
}
