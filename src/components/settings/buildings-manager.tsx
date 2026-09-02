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
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 px-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">
            Building Master Registry
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Define multi-structure complexes and physical buildings per project.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={activeProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
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
            size="sm"
            className="text-[9px] font-black uppercase tracking-widest px-4 py-2"
          >
            + Add Building
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 bg-slate-50 animate-pulse rounded-2xl" />
      ) : !buildings || buildings.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            No buildings defined for this project yet.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Click &quot;+ Add Building&quot; to establish master structural entities.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Name & Code</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Description</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Coordinates</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {buildings.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/50 transition-all">
                  <td className="py-4 pl-2">
                    <div className="font-black text-slate-800 uppercase tracking-tight">{b.name}</div>
                    {b.code && (
                      <span className="text-[9px] font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {b.code}
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-xs text-slate-500 max-w-xs truncate">
                    {b.description || '—'}
                  </td>
                  <td className="py-4 text-[10px] font-mono text-slate-500">
                    {b.latitude && b.longitude ? `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}` : '—'}
                  </td>
                  <td className="py-4 text-right pr-2 space-x-2">
                    <button
                      onClick={() => openEditModal(b)}
                      className="text-[9px] font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      className="text-[9px] font-black uppercase tracking-wider text-red-600 hover:text-red-700 bg-red-50 px-2.5 py-1 rounded-lg"
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">
                {editingBuilding ? 'Edit Building Record' : 'Register New Building'}
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Building Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tower 1 (West Wing)"
                className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Structure Code
                </label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. BLD-W1"
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Latitude / Longitude
                </label>
                <div className="flex gap-1">
                  <input
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    placeholder="Lat"
                    className="w-1/2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 outline-none"
                  />
                  <input
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    placeholder="Lng"
                    className="w-1/2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl px-2 py-2 outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Description & Structural Notes
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Reinforced concrete shear wall structure..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
              />
            </div>

            {error && (
              <p className="text-[9px] font-black text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100 uppercase">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="text-[9px] font-bold uppercase"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createBuilding.isPending || updateBuilding.isPending}
                className="text-[9px] font-black uppercase bg-primary text-white"
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
