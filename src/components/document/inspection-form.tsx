'use client'

import { useEffect, useState } from 'react'
import { useProjects } from '@/app/lib/queries'
import { useCreateInspection } from '@/app/lib/mutations'
import { inspectionFormSchema } from '@/app/lib/validators'
import { Button } from '@/components/ui/button'

const statusOptions = ['pending', 'in_progress', 'completed', 'requires_followup'] as const

export function InspectionForm() {
  const { data: projects } = useProjects()
  const createInspection = useCreateInspection()

  const [projectId, setProjectId] = useState('')
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState('')
  const [riskScore, setRiskScore] = useState('4.5')
  const [status, setStatus] = useState<(typeof statusOptions)[number]>('pending')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId && projects && projects.length > 0) {
      setProjectId(projects[0].id)
    }
  }, [projectId, projects])

  useEffect(() => {
    if (!projectId || !projects) return
    const project = projects.find((item) => item.id === projectId)
    if (project && !location) {
      setLocation(project.location)
    }
  }, [projectId, projects, location])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const parsed = inspectionFormSchema.safeParse({
      project_id: projectId,
      inspection_date: inspectionDate,
      location,
      risk_score: riskScore,
      status,
      notes,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form inputs.')
      return
    }

    try {
      await createInspection.mutateAsync(parsed.data)
      setInspectionDate(new Date().toISOString().slice(0, 10))
      setLocation('')
      setRiskScore('4.5')
      setStatus('pending')
      setNotes('')
      setSuccess('Inspection entry saved.')
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to create inspection.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
      <h3 className="text-sm font-bold text-slate-900 tracking-wide">NEW INSPECTION ENTRY</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Project</label>
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
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
          <label className="block text-xs font-semibold text-slate-600 mb-1">Inspection Date</label>
          <input
            type="date"
            value={inspectionDate}
            onChange={(event) => setInspectionDate(event.target.value)}
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
            placeholder="Building wing, floor, etc."
            required
          />
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
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm min-h-[120px]"
          placeholder="Describe observations, damage, or follow-up actions."
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={createInspection.isPending}>
          Save Inspection
        </Button>
      </div>
    </form>
  )
}
