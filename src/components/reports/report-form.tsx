'use client'

import { useEffect, useMemo, useState } from 'react'
import { useInspections, useProjects, useAIDetectionsForInspection, useARAnchors } from '@/app/lib/queries'
import { useCreateReport } from '@/app/lib/mutations'
import { reportFormSchema } from '@/app/lib/validators'
import { Button } from '@/components/ui/button'

type ReportFormProps = {
  projectId?: string
  onClose?: () => void
}

const statusOptions = ['open', 'in_review', 'critical', 'completed'] as const

export function ReportForm({ projectId, onClose }: ReportFormProps) {
  const { data: projects } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? '')
  const { data: inspections } = useInspections(selectedProjectId || undefined)
  const createReport = useCreateReport()

  const [title, setTitle] = useState('')
  const [inspectionId, setInspectionId] = useState('')
  const { data: aiDetections = [] } = useAIDetectionsForInspection(inspectionId || undefined)
  const { data: arAnchors = [] } = useARAnchors(inspectionId || undefined)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState('')
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('open')
  const [riskScore, setRiskScore] = useState('5')
  const [keyFindings, setKeyFindings] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedProjectId && projectId) {
      setSelectedProjectId(projectId)
      return
    }
    if (!selectedProjectId && projects && projects.length > 0) {
      setSelectedProjectId(projects[0].id)
    }
  }, [projectId, projects, selectedProjectId])

  useEffect(() => {
    if (!selectedProjectId || !projects) return
    const project = projects.find((item) => item.id === selectedProjectId)
    if (project && !location) {
      setLocation(project.location)
    }
  }, [selectedProjectId, projects, location])

  useEffect(() => {
    setInspectionId('')
  }, [selectedProjectId])

  const filteredInspections = useMemo(() => {
    if (!inspections) return []
    return inspections.slice(0, 20)
  }, [inspections])

  const aiSummary = useMemo(() => {
    if (!aiDetections || aiDetections.length === 0) return null
    const countsByType: Record<string, number> = {}
    const countsBySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 }
    let maxSeverityScore = 0

    aiDetections.forEach((d) => {
      countsByType[d.damage_type] = (countsByType[d.damage_type] || 0) + 1
      if (d.severity in countsBySeverity) {
        countsBySeverity[d.severity] += 1
      }
      if (d.severity_score > maxSeverityScore) {
        maxSeverityScore = d.severity_score
      }
    })

    return {
      total: aiDetections.length,
      countsByType,
      countsBySeverity,
      maxSeverityScore,
    }
  }, [aiDetections])

  const handleApplyAISuggestions = () => {
    if (!aiSummary && arAnchors.length === 0) return

    const findingsParts: string[] = []

    if (aiSummary && aiSummary.total > 0) {
      const typeSummary = Object.entries(aiSummary.countsByType)
        .map(([type, count]) => `${count} ${type}`)
        .join(', ')
      const severitySummary = Object.entries(aiSummary.countsBySeverity)
        .filter(([_, count]) => count > 0)
        .map(([sev, count]) => `${count} ${sev}`)
        .join(', ')
      findingsParts.push(
        `[AI Structural Intelligence]\n• Total Detections: ${aiSummary.total} (${typeSummary})\n• Severity Distribution: ${severitySummary}\n• Automated scan detected surface defects requiring engineering review.`
      )
    }

    if (arAnchors && arAnchors.length > 0) {
      const anchorLabels = arAnchors
        .map((a) => `${a.label} (${a.damage_type ?? 'structural'} - ${a.severity ?? 'unspecified'})`)
        .join('; ')
      findingsParts.push(
        `[AR Spatial Telemetry]\n• Registered ${arAnchors.length} AR Spatial Anchors: ${anchorLabels}`
      )
    }

    if (findingsParts.length > 0) {
      const combined = findingsParts.join('\n\n')
      setKeyFindings((prev) => (prev ? `${prev}\n\n${combined}` : combined))
    }

    if (aiSummary) {
      const calculatedRisk = Math.min(10, Math.max(1, aiSummary.maxSeverityScore / 10)).toFixed(1)
      setRiskScore(calculatedRisk)
      if (aiSummary.countsBySeverity.critical > 0) {
        setStatus('critical')
      } else if (aiSummary.countsBySeverity.high > 0) {
        setStatus('in_review')
      }
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccessMessage(null)

    const parsed = reportFormSchema.safeParse({
      title,
      project_id: selectedProjectId,
      inspection_id: inspectionId || undefined,
      date,
      location,
      status,
      risk_score: riskScore,
      key_findings: keyFindings,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form inputs.')
      return
    }

    try {
      await createReport.mutateAsync({
        ...parsed.data,
        inspection_id: parsed.data.inspection_id ?? null,
      })
      setSuccessMessage('Report created successfully.')
      if (onClose) {
        setTimeout(onClose, 1500)
      }
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to create report.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">Create New Report</h3>
        {createReport.isPending && (
          <span className="text-xs font-medium text-slate-500">Saving...</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Report Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Geotechnical inspection summary"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Project</label>
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
            required
          >
            <option value="" disabled>Select a project</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Inspection (Optional)</label>
          <select
            value={inspectionId}
            onChange={(event) => setInspectionId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
          >
            <option value="">No linked inspection</option>
            {filteredInspections.map((inspection) => (
              <option key={inspection.id} value={inspection.id}>
                {new Date(inspection.inspection_date).toLocaleDateString()} · {inspection.location}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Date</label>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Status</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Location</label>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="Zone / building"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Risk Score</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={riskScore}
            onChange={(event) => setRiskScore(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            required
          />
        </div>
      </div>

      {inspectionId && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/40 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
                AI & AR Intelligence Feed
              </span>
            </div>
            {(aiSummary || arAnchors.length > 0) && (
              <button
                type="button"
                onClick={handleApplyAISuggestions}
                className="text-[10px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-700 bg-blue-100/60 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors self-start sm:self-auto"
              >
                Auto-Populate Findings & Score 🪄
              </button>
            )}
          </div>

          {aiSummary || arAnchors.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {aiSummary && (
                <div className="bg-white/80 rounded-xl p-3 border border-slate-100 space-y-1.5">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">AI Detections ({aiSummary.total})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(aiSummary.countsByType).map(([type, count]) => (
                      <span key={type} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                        {count} {type}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2 text-[9px] font-black uppercase tracking-wider text-slate-500 pt-1">
                    {aiSummary.countsBySeverity.critical > 0 && (
                      <span className="text-red-600">{aiSummary.countsBySeverity.critical} Critical</span>
                    )}
                    {aiSummary.countsBySeverity.high > 0 && (
                      <span className="text-orange-600">{aiSummary.countsBySeverity.high} High</span>
                    )}
                    {aiSummary.countsBySeverity.medium > 0 && (
                      <span className="text-amber-600">{aiSummary.countsBySeverity.medium} Med</span>
                    )}
                    {aiSummary.countsBySeverity.low > 0 && (
                      <span className="text-emerald-600">{aiSummary.countsBySeverity.low} Low</span>
                    )}
                  </div>
                </div>
              )}

              {arAnchors.length > 0 ? (
                <div className="bg-white/80 rounded-xl p-3 border border-slate-100 space-y-1.5">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">AR Spatial Anchors ({arAnchors.length})</div>
                  <div className="flex flex-wrap gap-1.5">
                    {arAnchors.slice(0, 3).map((anchor) => (
                      <span key={anchor.id} className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[10px] uppercase">
                        📍 {anchor.label}
                      </span>
                    ))}
                    {arAnchors.length > 3 && (
                      <span className="text-[10px] font-bold text-slate-400 self-center">+{arAnchors.length - 3} more</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white/50 rounded-xl p-3 border border-dashed border-slate-200 flex items-center text-[10px] font-bold text-slate-400 uppercase">
                  No AR anchors placed for this inspection.
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              No AI detections or AR anchors yet for this inspection. Run AI analysis in the Asset Vault or drop anchors in AR Mode.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Key Findings</label>
        <textarea
          value={keyFindings}
          onChange={(event) => setKeyFindings(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm min-h-[120px] focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Summary of critical observations..."
        />
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 px-4 py-3 rounded-xl text-sm font-medium">
          {successMessage}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={createReport.isPending}>
          {createReport.isPending ? 'Saving...' : 'Create Report'}
        </Button>
      </div>
    </form>
  )
}
