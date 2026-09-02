'use client'

import { useEffect, useState } from 'react'
import { useProjects, useBuildings, useFloors, useStructuralElements } from '@/app/lib/queries'
import { useCreateInspection } from '@/app/lib/mutations'
import { inspectionFormSchema } from '@/app/lib/validators'
import { Button } from '@/components/ui/button'
import type { StructuralElement } from '@/app/types'

const statusOptions = ['pending', 'in_progress', 'completed', 'requires_followup'] as const

const structuralElementOptions: { value: StructuralElement; label: string }[] = [
  { value: 'beam', label: 'BEAM (STRUCTURAL)' },
  { value: 'column', label: 'COLUMN (LOAD BEARING)' },
  { value: 'slab', label: 'SLAB / DECK' },
  { value: 'wall', label: 'SHEAR / RETAINING WALL' },
  { value: 'foundation', label: 'FOUNDATION / PIER' },
  { value: 'facade', label: 'FAÇADE / EXTERIOR' },
  { value: 'roof', label: 'ROOF / TRUSS' },
  { value: 'general', label: 'GENERAL STRUCTURE' },
  { value: 'other', label: 'OTHER MEMBER' },
]

const floorOptions = [
  'Basement 2 (B2)',
  'Basement 1 (B1)',
  'Ground Floor (GF)',
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4+',
  'Roof Deck / Mezzanine',
  'Exterior / Perimeter',
]

export function InspectionForm() {
  const { data: projects } = useProjects()
  const createInspection = useCreateInspection()

  const [projectId, setProjectId] = useState('')
  const [selectedBuildingId, setSelectedBuildingId] = useState('')
  const [selectedFloorId, setSelectedFloorId] = useState('')
  const [selectedElementId, setSelectedElementId] = useState('')

  const { data: buildings } = useBuildings(projectId || undefined)
  const { data: floors } = useFloors(selectedBuildingId || undefined)
  const { data: elements } = useStructuralElements(selectedFloorId || undefined)

  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [location, setLocation] = useState('')
  const [floor, setFloor] = useState('Ground Floor (GF)')
  const [structuralElement, setStructuralElement] = useState<StructuralElement>('column')
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

  // Sync selected building
  useEffect(() => {
    if (buildings && buildings.length > 0 && !selectedBuildingId) {
      setSelectedBuildingId(buildings[0].id)
    }
  }, [buildings, selectedBuildingId])

  // Sync selected floor
  useEffect(() => {
    if (floors && floors.length > 0) {
      if (!selectedFloorId || !floors.some((f) => f.id === selectedFloorId)) {
        setSelectedFloorId(floors[0].id)
        setFloor(floors[0].name)
      }
    }
  }, [floors, selectedFloorId])

  // Sync selected element
  useEffect(() => {
    if (elements && elements.length > 0) {
      if (!selectedElementId || !elements.some((e) => e.id === selectedElementId)) {
        setSelectedElementId(elements[0].id)
        setStructuralElement(elements[0].element_type)
      }
    }
  }, [elements, selectedElementId])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const parsed = inspectionFormSchema.safeParse({
      project_id: projectId,
      inspection_date: inspectionDate,
      location,
      floor,
      structural_element: structuralElement,
      building_id: selectedBuildingId || undefined,
      floor_id: selectedFloorId || undefined,
      structural_element_id: selectedElementId || undefined,
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
      setSuccess('Inspection entry saved with structural element metadata.')
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to create inspection.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-100 pb-6 px-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Field Inspection Registry</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Select Building, Floor, and Structural Element.</p>
        </div>
        {createInspection.isPending && (
          <span className="text-[9px] font-black text-primary animate-pulse uppercase tracking-[0.2em]">Syncing...</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 flex-1">
        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Project</label>
          <select
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              setSelectedBuildingId('')
              setSelectedFloorId('')
              setSelectedElementId('')
            }}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            required
          >
            <option value="" disabled>SELECT_PROJECT</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Building</label>
          {buildings && buildings.length > 0 ? (
            <select
              value={selectedBuildingId}
              onChange={(event) => {
                setSelectedBuildingId(event.target.value)
                setSelectedFloorId('')
                setSelectedElementId('')
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.code ? `(${b.code})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="w-full rounded-xl border border-dashed border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-400 bg-slate-50">
              Main Structure (Single Building)
            </div>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Floor Level</label>
          {floors && floors.length > 0 ? (
            <select
              value={selectedFloorId}
              onChange={(event) => {
                const fid = event.target.value
                setSelectedFloorId(fid)
                const matched = floors.find((f) => f.id === fid)
                if (matched) setFloor(matched.name)
                setSelectedElementId('')
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>{f.name} (Level {f.level ?? 0})</option>
              ))}
            </select>
          ) : (
            <select
              value={floor}
              onChange={(event) => setFloor(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {floorOptions.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Structural Element</label>
          {elements && elements.length > 0 ? (
            <select
              value={selectedElementId}
              onChange={(event) => {
                const eid = event.target.value
                setSelectedElementId(eid)
                const matched = elements.find((e) => e.id === eid)
                if (matched) setStructuralElement(matched.element_type)
              }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {elements.map((elem) => (
                <option key={elem.id} value={elem.id}>
                  {elem.identifier} ({elem.element_type.toUpperCase()})
                </option>
              ))}
            </select>
          ) : (
            <select
              value={structuralElement}
              onChange={(event) => setStructuralElement(event.target.value as StructuralElement)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {structuralElementOptions.map((elem) => (
                <option key={elem.value} value={elem.value}>{elem.label}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Operation Date</label>
          <input
            type="date"
            value={inspectionDate}
            onChange={(event) => setInspectionDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            required
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Precise Zone / Pin</label>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="GRID_C4 / COLUMN_NORTH"
            required
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Initial Risk Score (0-10)</label>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={riskScore}
            onChange={(event) => setRiskScore(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            required
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Status Protocol</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as any)}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase().replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Technical Notes</label>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-[10px] font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[90px] resize-none"
          placeholder="ENTER_FIELD_OBSERVATIONS..."
        />
      </div>

      {error && <p className="text-[10px] font-bold text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
      {success && <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">{success}</p>}

      <div className="flex justify-end pt-4 border-t border-slate-100">
        <Button type="submit" disabled={createInspection.isPending} className="font-black uppercase tracking-[0.2em] text-[10px] px-10 py-5 h-auto shadow-lg shadow-primary/20">
          {createInspection.isPending ? 'Syncing...' : 'Register Inspection'}
        </Button>
      </div>
    </form>
  )
}
