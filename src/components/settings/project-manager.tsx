'use client'

import { useEffect, useState } from 'react'
import { useProjects } from '@/app/lib/queries'
import { createProject, setProjectArchived, updateProject } from '@/app/actions/projects'
import type { Project } from '@/app/types'
import { Chip, EmptyState, Field, InlineMessage, Panel, inputClass, useAsyncAction } from '@/components/structural/ui'

/**
 * Project registry.
 *
 * Projects were previously seed-only. Archiving is a soft delete: the site
 * disappears from active lists but keeps its inspections and reports.
 */
export function ProjectManager() {
  const { data: projects, isLoading, refetch } = useProjects()
  const [editing, setEditing] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'active' | 'completed' | 'on_hold' | 'cancelled'>('active')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [archiveId, setArchiveId] = useState<string | null>(null)
  const { pending, error, success, run } = useAsyncAction()

  const resetForm = () => {
    setEditing(null)
    setName('')
    setLocation('')
    setDescription('')
    setStatus('active')
    setLatitude('')
    setLongitude('')
  }

  useEffect(() => {
    if (!editing) return
    setName(editing.name)
    setLocation(editing.location ?? '')
    setDescription(editing.description ?? '')
    setStatus(editing.status)
    setLatitude(editing.latitude != null ? String(editing.latitude) : '')
    setLongitude(editing.longitude != null ? String(editing.longitude) : '')
  }, [editing])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const coordinates = {
      latitude: latitude.trim() ? Number(latitude) : null,
      longitude: longitude.trim() ? Number(longitude) : null,
    }

    const saved = await run(editing ? 'Project updated.' : 'Project created.', () =>
      editing
        ? updateProject({ projectId: editing.id, name: name.trim(), location: location.trim(), description: description.trim(), status, ...coordinates })
        : createProject({ name: name.trim(), location: location.trim(), description: description.trim(), status, ...coordinates })
    )

    if (saved) {
      resetForm()
      await refetch()
    }
  }

  const handleArchive = async (project: Project) => {
    const archived = !project.archived_at
    const saved = await run(archived ? 'Project archived.' : 'Project restored.', () =>
      setProjectArchived(project.id, archived)
    )
    if (saved) {
      setArchiveId(null)
      await refetch()
    }
  }

  return (
    <Panel title="Projects" description="Create, edit and archive sites. Archiving keeps the history and removes the site from active lists.">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <Field label="Project name" htmlFor="project-name">
          <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} className={inputClass} required />
        </Field>
        <Field label="Location" htmlFor="project-location">
          <input id="project-location" value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Status" htmlFor="project-status">
          <select id="project-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className={inputClass}>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On hold</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
        <Field label="Description" htmlFor="project-description">
          <input id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Latitude" htmlFor="project-lat" hint="Optional. Used to place the site on the map.">
          <input id="project-lat" type="number" step="any" value={latitude} onChange={(event) => setLatitude(event.target.value)} className={inputClass} />
        </Field>
        <Field label="Longitude" htmlFor="project-lng">
          <input id="project-lng" type="number" step="any" value={longitude} onChange={(event) => setLongitude(event.target.value)} className={inputClass} />
        </Field>

        {error && <div className="sm:col-span-2"><InlineMessage tone="error">{error}</InlineMessage></div>}
        {success && <div className="sm:col-span-2"><InlineMessage tone="success">{success}</InlineMessage></div>}

        <div className="sm:col-span-2 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center bg-white border border-slate-200 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-xl hover:bg-slate-50 transition-all min-h-[44px]"
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <div className="border-t border-slate-100 pt-4">
        <h4 className="text-[11px] font-bold text-slate-500 mb-2">All projects</h4>
        {isLoading && <p className="text-xs text-slate-500 font-medium">Loading…</p>}
        {!isLoading && (projects ?? []).length === 0 && (
          <EmptyState title="No projects yet" message="Create the first project to start recording inspections against it." />
        )}
        {!isLoading && (projects ?? []).length > 0 && (
          <ul className="divide-y divide-slate-100">
            {(projects ?? []).map((project) => (
              <li key={project.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{project.name}</span>
                  <Chip tone={project.archived_at ? 'neutral' : project.status === 'active' ? 'good' : 'info'}>
                    {project.archived_at ? 'archived' : project.status}
                  </Chip>
                  <span className="text-[11px] text-slate-500 font-medium">{project.location}</span>
                  <div className="ml-auto flex gap-3">
                    <button type="button" onClick={() => setEditing(project)} className="text-[11px] font-bold text-primary hover:underline">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => (archiveId === project.id ? handleArchive(project) : setArchiveId(project.id))}
                      className="text-[11px] font-bold text-slate-600 hover:underline"
                    >
                      {archiveId === project.id
                        ? project.archived_at ? 'Confirm restore' : 'Confirm archive'
                        : project.archived_at ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
