'use client'

import { useEffect, useMemo, useState } from 'react'
import { useInspections, useProjects } from '@/app/lib/queries'
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
