'use client'

import { useState } from 'react'
import { useProjects, useBuildings, useFloors } from '@/app/lib/queries'
import { useCreateFloor, useUpdateFloor, useDeleteFloor, useReorderFloors } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import type { Floor } from '@/app/types'

export function FloorManager() {
  const { data: projects } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const activeProjectId = selectedProjectId || (projects && projects[0]?.id) || ''

  const { data: buildings } = useBuildings(activeProjectId || undefined)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('')
  const activeBuildingId = selectedBuildingId || (buildings && buildings[0]?.id) || ''

  const { data: floors, isLoading } = useFloors(activeBuildingId || undefined)
  const createFloor = useCreateFloor()
  const updateFloor = useUpdateFloor()
  const deleteFloor = useDeleteFloor()
  const reorderFloors = useReorderFloors()

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null)
  const [name, setName] = useState('')
  const [level, setLevel] = useState('1')
  const [error, setError] = useState<string | null>(null)

  const openAddModal = () => {
    setEditingFloor(null)
    setName('')
    setLevel(floors ? String(floors.length + 1) : '1')
    setError(null)
    setIsModalOpen(true)
  }

  const openEditModal = (floor: Floor) => {
    setEditingFloor(floor)
    setName(floor.name)
    setLevel(floor.level !== null ? String(floor.level) : '0')
    setError(null)
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Floor name is required (e.g. Level 2 or Basement 1)')
      return
    }

    try {
      if (editingFloor) {
        await updateFloor.mutateAsync({
          id: editingFloor.id,
          buildingId: activeBuildingId,
          data: {
            name: name.trim(),
            level: parseInt(level, 10) || 0,
          },
        })
      } else {
        await createFloor.mutateAsync({
          building_id: activeBuildingId,
          name: name.trim(),
          level: parseInt(level, 10) || 0,
          sort_order: floors ? floors.length : 0,
        })
      }
      setIsModalOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save floor')
    }
  }

  const handleDelete = async (floorId: string) => {
    if (!confirm('Delete this floor? All attached structural elements will also be deleted.')) return
    try {
      await deleteFloor.mutateAsync({ id: floorId, buildingId: activeBuildingId })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete floor')
    }
  }

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (!floors) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= floors.length) return

    const newFloors = [...floors]
    const temp = newFloors[index]
    newFloors[index] = newFloors[targetIndex]
    newFloors[targetIndex] = temp

    const orderedIds = newFloors.map((f) => f.id)
    await reorderFloors.mutateAsync({ buildingId: activeBuildingId, orderedFloorIds: orderedIds })
  }

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 px-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">
            Floor & Level Hierarchy
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Define vertical levels, basements, and decks nested under each building.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={activeProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value)
              setSelectedBuildingId('')
            }}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
          >
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={activeBuildingId}
            onChange={(e) => setSelectedBuildingId(e.target.value)}
            disabled={!buildings || buildings.length === 0}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
          >
            {buildings?.length === 0 ? (
              <option value="">No Buildings Available</option>
            ) : (
              buildings?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.code ? `(${b.code})` : ''}
                </option>
              ))
            )}
          </select>

          <Button
            onClick={openAddModal}
            disabled={!activeBuildingId}
            size="sm"
            className="text-[9px] font-black uppercase tracking-widest px-4 py-2"
          >
            + Add Floor
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="h-32 bg-slate-50 animate-pulse rounded-2xl" />
      ) : !activeBuildingId ? (
        <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Select or register a building first to manage floors.
          </p>
        </div>
      ) : !floors || floors.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            No floor levels defined for this building.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Click &quot;+ Add Floor&quot; to define ground level, basements, or upper stories.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Floor Name</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Elevation / Level</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Order</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {floors.map((floor, idx) => (
                <tr key={floor.id} className="hover:bg-slate-50/50 transition-all">
                  <td className="py-4 pl-2 font-black text-slate-800 uppercase tracking-tight">
                    {floor.name}
                  </td>
                  <td className="py-4 text-xs font-bold text-slate-600">
                    Level {floor.level ?? '0'}
                  </td>
                  <td className="py-4">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMove(idx, 'up')}
                        disabled={idx === 0}
                        className="px-2 py-1 bg-slate-100 disabled:opacity-30 rounded hover:bg-slate-200 text-xs font-bold"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMove(idx, 'down')}
                        disabled={idx === floors.length - 1}
                        className="px-2 py-1 bg-slate-100 disabled:opacity-30 rounded hover:bg-slate-200 text-xs font-bold"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="py-4 text-right pr-2 space-x-2">
                    <button
                      onClick={() => openEditModal(floor)}
                      className="text-[9px] font-black uppercase tracking-wider text-slate-600 hover:text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(floor.id)}
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
            className="w-full max-w-sm rounded-[2rem] bg-white p-8 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">
                {editingFloor ? 'Edit Floor Level' : 'Add Floor Level'}
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
                Floor Designation *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ground Floor, Level 2, Basement 1"
                className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Level Index (Numeric)
              </label>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="0"
                className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
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
                disabled={createFloor.isPending || updateFloor.isPending}
                className="text-[9px] font-black uppercase bg-primary text-white"
              >
                {createFloor.isPending || updateFloor.isPending ? 'Saving…' : 'Save Floor'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
