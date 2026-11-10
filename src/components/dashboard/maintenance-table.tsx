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
      <div className="flex items-center justify-between px-1">
        <div>
          <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">
            Maintenance Prioritization
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
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
              className="text-xs font-bold text-primary uppercase tracking-wider bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors min-h-[36px]"
            >
              + Assign Task
            </button>
          )}
          <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200/60 tabular-nums">
            {items?.length || 0} Units
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-3 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent max-h-[380px]">
        {items?.map((item) => (
          <div
            key={item.id}
            role={canManage ? 'button' : undefined}
            tabIndex={canManage ? 0 : undefined}
            aria-label={canManage ? `Edit task: ${item.title}` : undefined}
            onClick={() => canManage && openEditModal(item)}
            onKeyDown={(event) => {
              if (!canManage) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openEditModal(item)
              }
            }}
            className={`p-4 rounded-2xl bg-white border border-slate-100 shadow-xs transition-colors group ${
              canManage ? 'cursor-pointer hover:shadow-md hover:border-primary/30' : ''
            }`}
          >
            <div className="flex justify-between items-start gap-2 mb-2">
              <div className="font-bold text-slate-900 uppercase tracking-tight text-xs leading-snug group-hover:text-primary transition-colors">
                {item.title}
              </div>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wider border ${
                  item.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : item.status === 'in_progress'
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : item.status === 'deferred'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-rose-50 text-red-700 border-rose-200'
                }`}
              >
                {item.status.replace('_', ' ')}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs font-medium text-slate-500 mt-2">
              <div className="truncate max-w-[180px]">{item.location}</div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs font-medium text-slate-400 uppercase">Score</span>
                <span className="text-xs font-bold text-slate-900 tabular-nums">{item.risk_score}</span>
              </div>
            </div>

            {(item.assigned_to_name || item.due_date) && (
              <div className="mt-2.5 pt-2 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Assignee:{' '}
                  <strong className="text-slate-700 font-semibold">
                    {typeof item.assigned_to_name === 'object' && item.assigned_to_name !== null
                      ? (item.assigned_to_name as any).full_name
                      : item.assigned_to_name || 'Unassigned'}
                  </strong>
                </span>
                {item.due_date && <span className="tabular-nums">Due: {item.due_date}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit / Assign Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white p-5 sm:p-8 shadow-2xl space-y-5 max-h-[90dvh] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Manage Maintenance Task
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {selectedTask.title}
                </p>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="min-w-11 min-h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Task Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as MaintenanceStatus)}
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="pending">PENDING (QUEUED)</option>
                  <option value="in_progress">IN PROGRESS (ACTIVE)</option>
                  <option value="completed">COMPLETED (RESOLVED)</option>
                  <option value="deferred">DEFERRED (ON HOLD)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Assign Maintenance Personnel
                </label>
                <select
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
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
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Target Completion Due Date
                </label>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Engineering Notes & Instructions
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Enter repair directives, contractor specs, or status update..."
                  className="w-full text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary min-h-[80px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTask(null)}
                className="text-xs font-bold uppercase min-h-[40px] px-4"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={updateTask.isPending}
                onClick={handleSaveEdit}
                className="text-xs font-bold uppercase bg-primary text-white min-h-[40px] px-4"
              >
                {updateTask.isPending ? 'Saving...' : 'Update Task'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-md rounded-2xl sm:rounded-3xl bg-white p-5 sm:p-8 shadow-2xl space-y-5 max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                  Assign Maintenance Task
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Create priority work ticket
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="min-w-11 min-h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Target Building / Project
                </label>
                <select
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
                  required
                >
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Task Title
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Repair Column 4B Cracking & Spall"
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                    Location
                  </label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Floor 2, Grid D3"
                    className="w-full text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                    Risk Score (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    step="0.1"
                    value={newScore}
                    onChange={(e) => setNewScore(e.target.value)}
                    className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary tabular-nums"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                    Assignee
                  </label>
                  <select
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary"
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
                  <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700 mb-1.5">
                  Directives & Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Task instructions..."
                  className="w-full text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 outline-none focus:ring-2 focus:ring-primary min-h-[60px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                className="text-xs font-bold uppercase min-h-[40px] px-4"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createTask.isPending}
                className="text-xs font-bold uppercase bg-primary text-white min-h-[40px] px-4"
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
