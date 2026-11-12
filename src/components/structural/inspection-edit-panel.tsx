'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateInspectionRecord } from '@/app/actions/structural'
import { useBuildings, useFloors, useProfile, useStructuralElements } from '@/app/lib/queries'
import type { Inspection } from '@/app/types'
import { Field, InlineMessage, Panel, inputClass, textareaClass, useAsyncAction } from './ui'

/** Inspectors edit their open field record; reopening belongs to engineering. */
export function InspectionEditPanel({ inspection }: { inspection: Inspection }) {
  const { data: profile } = useProfile()
  const cache = useQueryClient()
  const [date, setDate] = useState(inspection.inspection_date)
  const [location, setLocation] = useState(inspection.location)
  const [notes, setNotes] = useState(inspection.notes ?? '')
  const [status, setStatus] = useState(inspection.status)
  const [building, setBuilding] = useState(inspection.building_id ?? '')
  const [floor, setFloor] = useState(inspection.floor_id ?? '')
  const [element, setElement] = useState(inspection.structural_element_id ?? '')
  const [reopen, setReopen] = useState(false)
  const { data: buildings } = useBuildings(inspection.project_id)
  const { data: floors } = useFloors(building || undefined)
  const { data: elements } = useStructuralElements(floor || undefined)
  const { pending, error, success, run } = useAsyncAction()
  const engineering = profile?.role === 'engineer' || profile?.role === 'admin'
  const permitted = engineering || (profile?.role === 'inspector' && inspection.lead_inspector_id === profile.id)
  const locked = !permitted || (inspection.status === 'completed' && !(engineering && reopen))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (locked) return
    const result = (await run('Inspection updated.', () => updateInspectionRecord({
      inspectionId: inspection.id, inspectionDate: date, location: location.trim(), notes,
      status: reopen && status === 'completed' ? 'in_progress' : status,
      buildingId: building || null, floorId: floor || null, structuralElementId: element || null, reopen,
    }))) as Inspection | null
    if (result) {
      setReopen(false)
      setStatus(result.status)
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['inspections'] }),
        cache.invalidateQueries({ queryKey: ['my-inspections'] }),
      ])
    }
  }

  return (
    <Panel title="Inspection details" description="Edit the visit date, location, notes and structural links. Completed records require an engineer or administrator to reopen them.">
      {inspection.status === 'completed' && engineering && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reopen} onChange={(event) => setReopen(event.target.checked)} /> Reopen completed inspection</label>}
      {locked && <p className="text-sm text-slate-600">This record is locked for your current role or completion state.</p>}
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={locked || pending} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
          <Field label="Visit date" htmlFor="edit-inspection-date"><input id="edit-inspection-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required className={inputClass} /></Field>
          <Field label="Status" htmlFor="edit-inspection-status"><select id="edit-inspection-status" value={status} onChange={(event) => setStatus(event.target.value as Inspection['status'])} className={inputClass}>{['pending', 'in_progress', 'completed', 'requires_followup'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></Field>
          <Field label="Building" htmlFor="edit-inspection-building"><select id="edit-inspection-building" value={building} onChange={(event) => { setBuilding(event.target.value); setFloor(''); setElement('') }} className={inputClass}><option value="">No building linked</option>{buildings?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Floor" htmlFor="edit-inspection-floor"><select id="edit-inspection-floor" value={floor} onChange={(event) => { setFloor(event.target.value); setElement('') }} className={inputClass}><option value="">No floor linked</option>{floors?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Structural element" htmlFor="edit-inspection-element"><select id="edit-inspection-element" value={element} onChange={(event) => setElement(event.target.value)} className={inputClass}><option value="">No element linked</option>{elements?.map((item) => <option key={item.id} value={item.id}>{item.identifier}</option>)}</select></Field>
          <Field label="Location / zone" htmlFor="edit-inspection-location"><input id="edit-inspection-location" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={500} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="Inspection notes" htmlFor="edit-inspection-notes"><textarea id="edit-inspection-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={10000} className={textareaClass} /></Field></div>
        </fieldset>
        {error && <InlineMessage tone="error">{error}</InlineMessage>}
        {success && <InlineMessage tone="success">{success}</InlineMessage>}
        <button type="submit" disabled={locked || pending} className="rounded-xl bg-primary px-5 py-3 text-xs font-bold text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">{pending ? 'Saving…' : 'Save inspection'}</button>
      </form>
    </Panel>
  )
}
