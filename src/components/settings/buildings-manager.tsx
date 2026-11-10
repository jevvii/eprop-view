'use client'

import { useState } from 'react'
import { useProjects, useBuildings } from '@/app/lib/queries'
import { useCreateBuilding, useUpdateBuilding, useDeleteBuilding } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import type { Building } from '@/app/types'

export function BuildingsManager() {
  const { data: projects } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const activeProjectId = selectedProjectId || (projects && projects[0]?.id) || ''

  const { data: buildings, isLoading } = useBuildings(activeProjectId || undefined)
  const createBuilding = useCreateBuilding()
  const updateBuilding = useUpdateBuilding()
  const deleteBuilding = useDeleteBuilding()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [error, setError] = useState<string | null>(null)

  const openAddModal = () => {
    setEditingBuilding(null)
    setName('')
    setCode('')
    setDescription('')
    setLatitude('')
    setLongitude('')
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (building: Building) => {
    setEditingBuilding(building)
    setName(building.name)
    setCode(building.code || '')
    setDescription(building.description || '')
    setLatitude(building.latitude ? String(building.latitude) : '')
    setLongitude(building.longitude ? String(building.longitude) : '')
    setError(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Building name is required')
      return
    }

    try {
      if (editingBuilding) {
        await updateBuilding.mutateAsync({
          id: editingBuilding.id,
          data: {
            name: name.trim(),
            code: code.trim() || undefined,
            description: description.trim(),
            latitude: latitude ? parseFloat(latitude) : undefined,
            longitude: longitude ? parseFloat(longitude) : undefined,
          },
        })
      } else {
        await createBuilding.mutateAsync({
          project_id: activeProjectId,
          name: name.trim(),
          code: code.trim() || undefined,
          description: description.trim(),
          latitude: latitude ? parseFloat(latitude) : undefined,
          longitude: longitude ? parseFloat(longitude) : undefined,
        })
      }
      setIsModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save building')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this building? All nested floors and elements will be removed.')) {
      return
    }
    try {
      await deleteBuilding.mutateAsync(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete building')
    }
  }

  return (
    <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <h3 className="text-xs font-bold text-slate-600 tracking-wider uppercase mb-1">
            Building Master Registry
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Define multi-structure complexes and physical buildings per project.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={activeProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-base sm:text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[38px] outline-none"
          >
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <Button
            onClick={openAddModal}
            disabled={!activeProjectId}
            className="text-xs font-bold uppercase tracking-wider px-4 py-2 min-h-[38px]"
          >
            + Add Building
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 bg-slate-50 animate-pulse rounded-2xl" />
      ) : !buildings || buildings.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            No buildings defined for this project yet.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Click &quot;+ Add Building&quot; to establish master structural entities.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-3 font-bold text-xs text-slate-600 uppercase tracking-wider pl-2">Name & Code</th>
                <th className="py-3 font-bold text-xs text-slate-600 uppercase tracking-wider">Description</th>
                <th className="py-3 font-bold text-xs text-slate-600 uppercase tracking-wider">Coordinates</th>
                <th className="py-3 font-bold text-xs text-slate-600 uppercase tracking-wider text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buildings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/70 transition-all">
                  <td className="py-4 pl-2">
                    <div className="font-bold text-slate-900 tracking-tight">{b.name}</div>
                    {b.code && (
                      <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded mt-0.5 inline-block">
                        {b.code}
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-xs text-slate-600 max-w-xs truncate">
                    {b.description || '—'}
                  </td>
                  <td className="py-4 text-xs font-mono tabular-nums text-slate-600">
                    {b.latitude && b.longitude ? `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}` : '—'}
                  </td>
                  <td className="py-4 text-right pr-2 space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(b)}
                      className="text-xs font-bold uppercase tracking-wider text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 min-h-[32px] rounded-lg transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="text-xs font-bold uppercase tracking-wider text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 min-h-[32px] rounded-lg transition-colors"
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

      {/* Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white p-5 sm:p-7 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-base font-bold uppercase tracking-wider text-slate-800">
                {editingBuilding ? 'Edit Building Record' : 'Register New Building'}
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close modal"
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Building Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tower 1 (West Wing)"
                className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Structure Code
                </label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. BLD-W1"
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Latitude / Longitude
                </label>
                <div className="flex gap-1.5">
                  <input
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="Lat"
                    className="w-1/2 text-base sm:text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="Lng"
                    className="w-1/2 text-base sm:text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Description & Structural Notes
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Reinforced concrete shear wall structure..."
                className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {error && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="text-xs font-bold uppercase min-h-[40px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createBuilding.isPending || updateBuilding.isPending}
                className="text-xs font-bold uppercase bg-primary text-white min-h-[40px]"
              >
                {createBuilding.isPending || updateBuilding.isPending ? 'Saving…' : 'Save Building'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
