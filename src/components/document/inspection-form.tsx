'use client'

import { useEffect, useState } from 'react'
import { useProjects, useBuildings, useFloors, useStructuralElements } from '@/app/lib/queries'
import { useCreateInspection } from '@/app/lib/mutations'
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

    try {
      // Server-side validation is authoritative; no schema ships to the client.
      await createInspection.mutateAsync({
        project_id: projectId,
        inspection_date: inspectionDate,
        location,
        floor,
        structural_element: structuralElement,
        building_id: selectedBuildingId || null,
        floor_id: selectedFloorId || null,
        structural_element_id: selectedElementId || null,
        risk_score: riskScore,
        status,
        notes,
      })
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
    <form onSubmit={handleSubmit} className="bg-white p-5 sm:p-6 lg:p-8 rounded-lg sm:rounded-lg shadow-sm border border-slate-100 space-y-6 flex flex-col h-full min-w-0">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 px-1">
        <div>
          <h3 className="text-xs font-bold text-slate-700 mb-0.5">Field Inspection Registry</h3>
          <p className="text-xs text-slate-500 font-medium">Select Building, Floor, and Structural Element.</p>
        </div>
        {createInspection.isPending && (
          <span className="text-xs font-bold text-primary animate-pulse">Syncing...</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 flex-1">
        <div>
          <label htmlFor="inspection-project" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Project</label>
          <select id="inspection-project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              setSelectedBuildingId('')
              setSelectedFloorId('')
              setSelectedElementId('')
            }}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            required
          >
            <option value="" disabled>SELECT_PROJECT</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="inspection-building" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Building</label>
          {buildings && buildings.length > 0 ? (
            <select id="inspection-building"
              value={selectedBuildingId}
              onChange={(event) => {
                setSelectedBuildingId(event.target.value)
                setSelectedFloorId('')
                setSelectedElementId('')
              }}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.code ? `(${b.code})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <div className="w-full rounded-xl border border-dashed border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-medium text-slate-500 bg-slate-50">
              Main Structure (Single Building)
            </div>
          )}
        </div>

        <div>
          <label htmlFor="inspection-floor" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Floor Level</label>
          {floors && floors.length > 0 ? (
            <select id="inspection-floor"
              value={selectedFloorId}
              onChange={(event) => {
                const fid = event.target.value
                setSelectedFloorId(fid)
                const matched = floors.find((f) => f.id === fid)
                if (matched) setFloor(matched.name)
                setSelectedElementId('')
              }}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {floors.map((f) => (
                <option key={f.id} value={f.id}>{f.name} (Level {f.level ?? 0})</option>
              ))}
            </select>
          ) : (
            <select
              value={floor}
              onChange={(event) => setFloor(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {floorOptions.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="inspection-element" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Structural Element</label>
          {elements && elements.length > 0 ? (
            <select id="inspection-element"
              value={selectedElementId}
              onChange={(event) => {
                const eid = event.target.value
                setSelectedElementId(eid)
                const matched = elements.find((e) => e.id === eid)
                if (matched) setStructuralElement(matched.element_type)
              }}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
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
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
            >
              {structuralElementOptions.map((elem) => (
                <option key={elem.value} value={elem.value}>{elem.label}</option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label htmlFor="inspection-date" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Operation Date</label>
          <input id="inspection-date"
            type="date"
            value={inspectionDate}
            onChange={(event) => setInspectionDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-medium bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            required
          />
        </div>

        <div>
          <label htmlFor="inspection-location" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Precise Zone / Pin</label>
          <input id="inspection-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-medium bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            placeholder="GRID_C4 / COLUMN_NORTH"
            required
          />
        </div>

        <div>
          <label htmlFor="inspection-risk" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Initial Risk Score (0-10)</label>
          <input id="inspection-risk"
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={riskScore}
            onChange={(event) => setRiskScore(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all tabular-nums"
            required
          />
        </div>

        <div>
          <label htmlFor="inspection-status" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Status Protocol</label>
          <select id="inspection-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as any)}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-semibold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none"
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
        <label htmlFor="inspection-notes" className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Technical Notes</label>
        <textarea id="inspection-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-base sm:text-sm font-medium bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all min-h-[90px] resize-none"
          placeholder="Enter field observations, structural anomalies..."
        />
      </div>

      {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{error}</p>}
      {success && <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100">{success}</p>}

      <div className="flex justify-end pt-3 border-t border-slate-100">
        <Button type="submit" disabled={createInspection.isPending} className="font-bold text-xs px-8 min-h-[44px] shadow-md shadow-primary/20">
          {createInspection.isPending ? 'Syncing...' : 'Register Inspection'}
        </Button>
      </div>
    </form>
  )
}
