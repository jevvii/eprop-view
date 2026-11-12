'use client'

import { useState } from 'react'
import { useProjects, useBuildings, useFloors, useStructuralElements } from '@/app/lib/queries'
import {
  useCreateStructuralElement,
  useUpdateStructuralElement,
  useDeleteStructuralElement,
  useImportStructuralElementsCSV,
} from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import type { StructuralElementRecord, StructuralElement } from '@/app/types'

const ELEMENT_TYPES: { value: StructuralElement; label: string }[] = [
  { value: 'beam', label: 'Beam' },
  { value: 'column', label: 'Column' },
  { value: 'slab', label: 'Slab / Deck' },
  { value: 'wall', label: 'Shear Wall' },
  { value: 'foundation', label: 'Foundation / Pier' },
  { value: 'facade', label: 'Façade' },
  { value: 'roof', label: 'Roof / Truss' },
  { value: 'general', label: 'General Member' },
  { value: 'other', label: 'Other' },
]

export function StructuralElementManager() {
  const { data: projects } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const activeProjectId = selectedProjectId || (projects && projects[0]?.id) || ''

  const { data: buildings } = useBuildings(activeProjectId || undefined)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('')
  const activeBuildingId = selectedBuildingId || (buildings && buildings[0]?.id) || ''

  const { data: floors } = useFloors(activeBuildingId || undefined)
  const [selectedFloorId, setSelectedFloorId] = useState<string>('')
  const activeFloorId = selectedFloorId || (floors && floors[0]?.id) || ''

  const { data: elements, isLoading } = useStructuralElements(activeFloorId || undefined)
  const createElement = useCreateStructuralElement()
  const updateElement = useUpdateStructuralElement()
  const deleteElement = useDeleteStructuralElement()
  const importCSV = useImportStructuralElementsCSV()

  const [filterType, setFilterType] = useState<string>('all')

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingElement, setEditingElement] = useState<StructuralElementRecord | null>(null)
  const [identifier, setIdentifier] = useState('')
  const [elementType, setElementType] = useState<StructuralElement>('column')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  // CSV Import Modal state
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false)
  const [csvContent, setCsvContent] = useState('')
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null)

  const openAddModal = () => {
    setEditingElement(null)
    setIdentifier('')
    setElementType('column')
    setDescription('')
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (elem: StructuralElementRecord) => {
    setEditingElement(elem)
    setIdentifier(elem.identifier)
    setElementType(elem.element_type)
    setDescription(elem.description || '')
    setError(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!identifier.trim()) {
      setError('Element identifier is required (e.g. C-14 or B-02)')
      return
    }

    try {
      if (editingElement) {
        await updateElement.mutateAsync({
          id: editingElement.id,
          floorId: activeFloorId,
          data: {
            identifier: identifier.trim(),
            element_type: elementType,
            description: description.trim(),
          },
        })
      } else {
        await createElement.mutateAsync({
          floor_id: activeFloorId,
          identifier: identifier.trim(),
          element_type: elementType,
          description: description.trim(),
        })
      }
      setIsModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save element')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this structural element?')) return
    try {
      await deleteElement.mutateAsync({ id, floorId: activeFloorId })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete element')
    }
  }

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault()
    setImportResult(null)
    if (!csvContent.trim()) return

    try {
      const res = await importCSV.mutateAsync({
        floorId: activeFloorId,
        csvContent,
      })
      setImportResult(res)
      if (res.created > 0 && res.errors.length === 0) {
        setTimeout(() => {
          setIsCsvModalOpen(false)
          setCsvContent('')
          setImportResult(null)
        }, 1200)
      }
    } catch (err) {
      setImportResult({ created: 0, errors: [err instanceof Error ? err.message : 'CSV import failed'] })
    }
  }

  const filteredElements = elements?.filter((el) => {
    if (filterType === 'all') return true
    return el.element_type === filterType
  })

  return (
    <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-lg sm:rounded-lg shadow-sm border border-slate-200 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h3 className="text-xs font-bold text-slate-600 mb-1">
            Structural Element Catalog
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Beams, columns, shear walls, and load-bearing members assigned per floor.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setIsCsvModalOpen(true)}
            disabled={!activeFloorId}
            variant="outline"
            className="text-xs font-bold px-3.5 py-2 min-h-[38px]"
          >
            Import CSV
          </Button>

          <Button
            onClick={openAddModal}
            disabled={!activeFloorId}
            className="text-xs font-bold px-4 py-2 min-h-[38px]"
          >
            + Add Element
          </Button>
        </div>
      </div>

      {/* Selectors Hierarchy */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Project</label>
          <select
            value={activeProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value)
              setSelectedBuildingId('')
              setSelectedFloorId('')
            }}
            className="w-full text-base sm:text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[38px] outline-none"
          >
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Building</label>
          <select
            value={activeBuildingId}
            onChange={(e) => {
              setSelectedBuildingId(e.target.value)
              setSelectedFloorId('')
            }}
            disabled={!buildings || buildings.length === 0}
            className="w-full text-base sm:text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[38px] outline-none"
          >
            {buildings?.length === 0 ? (
              <option value="">No Buildings</option>
            ) : (
              buildings?.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1.5">Floor Level</label>
          <select
            value={activeFloorId}
            onChange={(e) => setSelectedFloorId(e.target.value)}
            disabled={!floors || floors.length === 0}
            className="w-full text-base sm:text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[38px] outline-none"
          >
            {floors?.length === 0 ? (
              <option value="">No Floors</option>
            ) : (
              floors?.map((f) => (
                <option key={f.id} value={f.id}>{f.name} (L{f.level ?? 0})</option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* Filter Tabs */}
      {elements && elements.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => setFilterType('all')}
 className={`text-xs font-bold px-3.5 py-1.5 min-h-[36px] rounded-xl transition-all ${
              filterType === 'all' ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All (<span className="tabular-nums">{elements.length}</span>)
          </button>
          {ELEMENT_TYPES.map((t) => {
            const count = elements.filter((el) => el.element_type === t.value).length
            if (count === 0) return null
            return (
              <button
                key={t.value}
                onClick={() => setFilterType(t.value)}
 className={`text-xs font-bold px-3.5 py-1.5 min-h-[36px] rounded-xl transition-all ${
                  filterType === t.value ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label} (<span className="tabular-nums">{count}</span>)
              </button>
            )
          })}
        </div>
      )}

      {/* Elements Table */}
      {isLoading ? (
        <div className="h-32 bg-slate-50 animate-pulse rounded-lg" />
      ) : !activeFloorId ? (
        <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg">
          <p className="text-xs font-bold text-slate-500">
            Select a project, building, and floor level to inspect elements.
          </p>
        </div>
      ) : !elements || elements.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg">
          <p className="text-xs font-bold text-slate-500">
            No structural elements cataloged on this floor.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Add members individually or click &quot;Import CSV&quot; to bulk upload architectural schedules.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-3 font-bold text-xs text-slate-600 pl-2">Identifier</th>
                <th className="py-3 font-bold text-xs text-slate-600">Member Type</th>
                <th className="py-3 font-bold text-xs text-slate-600">Description</th>
                <th className="py-3 font-bold text-xs text-slate-600 text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredElements?.map((elem) => (
                <tr key={elem.id} className="hover:bg-slate-50/70 transition-all">
                  <td className="py-3 pl-2 font-bold text-slate-900">
                    {elem.identifier}
                  </td>
                  <td className="py-3">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                      {elem.element_type}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-600 max-w-xs truncate">
                    {elem.description || '—'}
                  </td>
                  <td className="py-3 text-right pr-2 space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(elem)}
                      className="text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 min-h-[32px] rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(elem.id)}
                      className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 min-h-[32px] rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Element Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-lg sm:rounded-lg bg-white p-5 sm:p-7 shadow-lg space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="text-base font-bold text-slate-800">
                {editingElement ? 'Edit Member Record' : 'Add Structural Member'}
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close modal"
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold transition-colors"
              >
                ×
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Identifier *
              </label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="e.g. Column C-12 or Beam B-3"
                className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Element Classification
              </label>
              <select
                value={elementType}
                onChange={(e) => setElementType(e.target.value as StructuralElement)}
                className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
              >
                {ELEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Description / Notes
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Reinforced cast-in-place concrete column..."
                className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="text-xs font-bold min-h-[40px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createElement.isPending || updateElement.isPending}
                className="text-xs font-bold bg-primary text-white min-h-[40px]"
              >
                {createElement.isPending || updateElement.isPending ? 'Saving…' : 'Save Member'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <form
            onSubmit={handleCsvImport}
            className="w-full max-w-lg rounded-lg sm:rounded-lg bg-white p-5 sm:p-7 shadow-lg space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h4 className="text-base font-bold text-slate-800">
                  Bulk Import Structural Members
                </h4>
                <p className="text-xs text-slate-500 font-medium">
                  Import CSV schedule into active floor
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCsvModalOpen(false)}
                aria-label="Close modal"
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold transition-colors"
              >
                ×
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <p className="font-bold text-slate-700">Expected CSV Format (with headers):</p>
              <pre className="font-mono text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 overflow-x-auto">
                identifier,element_type,description{'\n'}
                Column C-1,column,Reinforced concrete column{'\n'}
                Beam B-10,beam,Post-tensioned transfer beam{'\n'}
                Wall SW-1,wall,Exterior core shear wall
              </pre>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Paste CSV Data
              </label>
              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                rows={6}
                placeholder="Paste CSV text here..."
                className="w-full font-mono text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            {importResult && (
 <div className={`p-3.5 rounded-xl text-xs font-bold ${
                importResult.errors.length > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}>
                <p>Import Complete: <span className="tabular-nums">{importResult.created}</span> structural elements created.</p>
                {importResult.errors.length > 0 && (
                  <ul className="list-disc pl-4 mt-1.5 text-red-600 space-y-0.5">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCsvModalOpen(false)}
                className="text-xs font-bold min-h-[40px]"
              >
                Close
              </Button>
              <Button
                type="submit"
                disabled={importCSV.isPending || !csvContent.trim()}
                className="text-xs font-bold bg-primary text-white min-h-[40px]"
              >
                {importCSV.isPending ? 'Importing…' : 'Start Import'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
