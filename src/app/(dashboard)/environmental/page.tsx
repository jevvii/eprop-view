'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useProjects, useRiskHotspots, useProfile } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'
import { AccessDenied } from '@/components/shared/require-role'
import { EnvMap } from '@/components/environmental/env-map-lazy'
import { AnalysisPanel } from '@/components/environmental/analysis-panel'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'

export default function EnvironmentalPage() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const queryClient = useQueryClient()
  const { data: projects, isLoading, isError } = useProjects()
  const [projectId, setProjectId] = useState('')
  const { data: hotspots } = useRiskHotspots(projectId || undefined)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const canViewEnv = hasCapability(profile?.role, 'dashboard:view') || hasCapability(profile?.role, 'envrisk:assess')

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projectId, projects])

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === projectId),
    [projects, projectId]
  )

  if (profileLoading) {
    return <div className="bg-white p-6 rounded-lg shadow-lg h-40 animate-pulse" />
  }

  if (profile && !canViewEnv) {
    return (
      <AccessDenied
        title="Environmental Assessment Restricted"
        message="Geohazard and environmental risk assessment is restricted to Structural Engineers and System Administrators. Inspectors can access the Document Vault to submit inspection photos."
        returnHref="/document"
        returnLabel="Go to Document Vault"
      />
    )
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['risk-hotspots', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['environmental-risk', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['geospatial-zones', projectId] }),
      ])
    } finally {
      // Small delay for visual feedback
      setTimeout(() => setIsRefreshing(false), 500)
    }
  }

  if (isLoading) {
    return <div className="bg-white p-6 rounded-lg shadow-lg h-40 animate-pulse" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg text-red-600">
        Failed to load projects for environmental view
      </div>
    )
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-lg text-slate-500">
        Add a project to begin environmental analysis.
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-1 sm:px-2">
        <div>
          <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Environmental Risk Assessment</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Analyze hazard zones and update site suitability scores.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 bg-white p-2 rounded-lg border border-slate-100 shadow-xs w-full sm:w-auto">
            <label className="text-xs font-bold text-slate-700 pl-2">Current Project</label>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all flex-1 sm:flex-initial"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="font-bold text-xs px-5 h-11 border-slate-200"
          >
            {isRefreshing ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Syncing
              </span>
            ) : (
              'Refresh Data'
            )}
          </Button>
        </div>
      </div>

      {projectId && (
        <div className="grid grid-cols-1 gap-6 lg:gap-8 xl:grid-cols-[1.8fr_1fr] items-start">
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

      <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-lg sm:rounded-lg shadow-lg border border-slate-100">
        <h3 className="text-xs font-bold text-slate-700 mb-6 ml-1">Sector Risk Hotspots</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {hotspots && hotspots.length > 0 ? (
            hotspots.slice(0, 6).map((hotspot) => (
              <div key={hotspot.id} className="flex flex-col gap-3 rounded-lg border border-slate-100 p-5 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all group">
                <div className="flex justify-between items-start gap-2">
                  <div className="text-xs font-bold text-slate-900 group-hover:text-primary transition-colors">{hotspot.title}</div>
                  <StatusBadge status={hotspot.severity} />
                </div>
                <div className="text-xs text-slate-600 font-medium leading-relaxed line-clamp-2">{hotspot.description || 'No detailed analysis provided for this sector.'}</div>
              </div>
            ))
          ) : (
            <p className="text-xs font-medium text-slate-500 italic ml-1">No active hotspots recorded for this project.</p>
          )}
        </div>
      </div>
    </div>
  )
}
