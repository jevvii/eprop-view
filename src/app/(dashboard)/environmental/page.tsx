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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Environmental Risk Assessment</h2>
          <p className="text-slate-500">Analyze hazard zones and update site suitability scores.</p>
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

      {projectId && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr,1fr]">
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

      <div className="bg-white p-6 rounded-2xl shadow-lg">
        <h3 className="text-sm font-bold text-slate-900 tracking-wide">RISK HOTSPOTS</h3>
        <div className="mt-4 space-y-3">
          {hotspots && hotspots.length > 0 ? (
            hotspots.slice(0, 6).map((hotspot) => (
              <div key={hotspot.id} className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 p-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{hotspot.title}</div>
                  <div className="text-xs text-slate-500">{hotspot.description || 'No description provided.'}</div>
                </div>
                <StatusBadge status={hotspot.severity} />
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No hotspots recorded for this project.</p>
          )}
        </div>
      </div>
    </div>
  )
}
