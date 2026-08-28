'use client'

import { useState } from 'react'
import { useMaintenancePriorities, useStaffProfiles, useProjects, useProfile } from '@/app/lib/queries'
import { useCreateMaintenanceTask, useUpdateMaintenanceTask } from '@/app/lib/mutations'
import type { MaintenancePriority, MaintenanceStatus } from '@/app/types'
import { Button } from '@/components/ui/button'

export function MaintenanceTable() {
  const { data: items, isLoading, isError } = useMaintenancePriorities()
  const { data: staff } = useStaffProfiles()
  const { data: projects } = useProjects()
  const { data: currentProfile } = useProfile()
  const createTask = useCreateMaintenanceTask()
  const updateTask = useUpdateMaintenanceTask()

  const [selectedTask, setSelectedTask] = useState<MaintenancePriority | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Edit Task State
  const [editStatus, setEditStatus] = useState<MaintenanceStatus>('pending')
  const [editAssignee, setEditAssignee] = useState<string>('')
  const [editDueDate, setEditDueDate] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')

  // Create Task State
  const [newProjectId, setNewProjectId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newScore, setNewScore] = useState('7.5')
  const [newStatus, setNewStatus] = useState<MaintenanceStatus>('pending')
  const [newAssignee, setNewAssignee] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const canManage = currentProfile?.role === 'admin' || currentProfile?.role === 'engineer'

  const openEditModal = (task: MaintenancePriority) => {
    setSelectedTask(task)
    setEditStatus(task.status)
    setEditAssignee(task.assigned_to || '')
    setEditDueDate(task.due_date || '')
    setEditNotes(task.notes || '')
  }

  const handleSaveEdit = async () => {
    if (!selectedTask) return
    await updateTask.mutateAsync({
      id: selectedTask.id,
      updates: {
        status: editStatus,
        assigned_to: editAssignee || null,
        due_date: editDueDate || null,
        notes: editNotes,
      },
    })
    setSelectedTask(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectId || !newTitle) return
    await createTask.mutateAsync({
      project_id: newProjectId,
      title: newTitle,
      location: newLocation || 'Structural Site',
      risk_score: parseFloat(newScore) || 5.0,
      status: newStatus,
      assigned_to: newAssignee || null,
      due_date: newDueDate || null,
      notes: newNotes,
    })
    setIsCreateOpen(false)
    setNewTitle('')
    setNewLocation('')
    setNewNotes('')
  }

  if (isLoading) {
    return <div className="bg-white p-8 rounded-[2rem] shadow-sm animate-pulse h-80" />
  }

  if (isError) {
    return (
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-red-100 text-red-600 font-bold uppercase tracking-widest text-center">
        Maintenance Log Link Offline
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between px-2">
        <div>
          <h3 className="text-[0.65rem] font-black text-slate-400 tracking-[0.15em] uppercase">
            Maintenance Prioritization
          </h3>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
            Prioritized repairs & task assignments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => {
                if (projects && projects.length > 0) setNewProjectId(projects[0].id)
                setIsCreateOpen(true)
              }}
              className="text-[9px] font-black text-primary uppercase tracking-widest bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-lg transition-colors"
            >
              + Assign Task
            </button>
          )}
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
            {items?.length || 0} Units
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent max-h-[380px]">
        {items?.map((item) => (
          <div
            key={item.id}
            onClick={() => canManage && openEditModal(item)}
            className={`p-4 rounded-2xl bg-white border border-slate-100 shadow-sm transition-all group ${
              canManage ? 'cursor-pointer hover:shadow-md hover:border-primary/30' : ''
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="font-black text-black uppercase tracking-tight text-xs leading-snug group-hover:text-primary transition-colors">
                {item.title}
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                  item.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : item.status === 'in_progress'
                    ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                    : item.status === 'deferred'
                    ? 'bg-amber-50 text-amber-600 border-amber-100'
                    : 'bg-rose-50 text-red-600 border-rose-100'
                }`}
              >
                {item.status.replace('_', ' ')}
              </span>
            </div>

            <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-2">
              <div className="truncate max-w-[180px]">{item.location}</div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter">Score</span>
                <span className="text-xs font-black text-black">{item.risk_score}</span>
              </div>
            </div>

            {(item.assigned_to_name || item.due_date) && (
              <div className="mt-2.5 pt-2 border-t border-slate-50 flex items-center justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Assignee: <strong className="text-slate-600 font-black">{item.assigned_to_name || 'Unassigned'}</strong></span>
                {item.due_date && <span>Due: {item.due_date}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit / Assign Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  Manage Maintenance Task
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                  {selectedTask.title}
                </p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Task Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as MaintenanceStatus)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                >
                  <option value="pending">PENDING (QUEUED)</option>
                  <option value="in_progress">IN PROGRESS (ACTIVE)</option>
                  <option value="completed">COMPLETED (RESOLVED)</option>
                  <option value="deferred">DEFERRED (ON HOLD)</option>
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Assign Maintenance Personnel
                </label>
                <select
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                >
                  <option value="">UNASSIGNED</option>
                  {staff?.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} ({person.role.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Target Completion Due Date
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Engineering Notes & Instructions
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Enter repair directives, contractor specs, or status update..."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none min-h-[80px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTask(null)}
                className="text-[9px] font-bold uppercase"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={updateTask.isPending}
                onClick={handleSaveEdit}
                className="text-[9px] font-black uppercase bg-primary text-white"
              >
                {updateTask.isPending ? 'Saving...' : 'Update Task'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  Assign Maintenance Task
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                  Create priority work ticket
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Target Building / Project
                </label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  required
                >
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Repair Column 4B Cracking & Spall"
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Floor 2, Grid D3"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Risk Score (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.1"
                    value={newScore}
                    onChange={(e) => setNewScore(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Assignee
                  </label>
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="">UNASSIGNED</option>
                    {staff?.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Directives & Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Task instructions..."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none min-h-[60px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="text-[9px] font-bold uppercase"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createTask.isPending}
                className="text-[9px] font-black uppercase bg-primary text-white"
              >
                {createTask.isPending ? 'Assigning...' : 'Confirm Assignment'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
