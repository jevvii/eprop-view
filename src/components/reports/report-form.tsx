'use client'

import { useEffect, useMemo, useState } from 'react'
import { useInspections, useProjects } from '@/app/lib/queries'
import { useCreateReport } from '@/app/lib/mutations'
import { reportFormSchema } from '@/app/lib/validators'
import { Button } from '@/components/ui/button'

type ReportFormProps = {
  projectId?: string
}

const statusOptions = ['open', 'in_review', 'critical', 'completed'] as const

export function ReportForm({ projectId }: ReportFormProps) {
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
      setTitle('')
      setInspectionId('')
      setDate(new Date().toISOString().slice(0, 10))
      setLocation('')
      setStatus('open')
      setRiskScore('5')
      setKeyFindings('')
      setSuccessMessage('Report created successfully.')
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to create report.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">CREATE NEW REPORT</h3>
        {createReport.isPending && (
          <span className="text-xs font-medium text-slate-500">Saving...</span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Report Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Geotechnical inspection summary"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Project</label>
          <select
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            required
          >
            <option value="" disabled>Select a project</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Inspection (Optional)</label>
          <select
            value={inspectionId}
            onChange={(event) => setInspectionId(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
          <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Location</label>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder="Zone / building"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Risk Score</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={riskScore}
            onChange={(event) => setRiskScore(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Key Findings</label>
        <textarea
          value={keyFindings}
          onChange={(event) => setKeyFindings(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[100px]"
          placeholder="Summary of critical observations..."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {successMessage && <p className="text-sm text-emerald-600">{successMessage}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={createReport.isPending}>
          Create Report
        </Button>
      </div>
    </form>
  )
}
