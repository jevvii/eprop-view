'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { recordAuditEvent } from '@/app/lib/audit'
import { z } from 'zod'
import type { Project } from '@/app/types'

/**
 * Project CRUD.
 *
 * Projects were seed-only: there was no way to create, edit or archive one from
 * the application. Archiving is a soft delete so an archived site keeps its
 * inspection and report history.
 */

const uuid = z.string().uuid()

const projectInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    location: z.string().max(500).default(''),
    description: z.string().max(5000).default(''),
    status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).default('active'),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
  })
  .strict()

export async function createProject(input: z.input<typeof projectInputSchema>): Promise<Project> {
  const { userId } = await requireRole(['admin'])
  const parsed = projectInputSchema.parse(input)
  const supabase = await createClient()

  const hasCoordinates = parsed.latitude != null && parsed.longitude != null
  const geom = hasCoordinates
    ? `SRID=4326;POINT(${parsed.longitude} ${parsed.latitude})`
    : null

  const { data, error } = await supabase
    .from('projects')
    .insert({
      name: parsed.name,
      location: parsed.location,
      description: parsed.description,
      status: parsed.status,
      created_by: userId,
      ...(geom ? { geom } : {}),
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create project')

  await recordAuditEvent({
    action: 'project.create',
    entityType: 'project',
    entityId: data.id,
    after: { name: parsed.name, status: parsed.status },
  })

  return data as Project
}

const projectUpdateSchema = z
  .object({
    projectId: uuid,
    name: z.string().min(1).max(200).optional(),
    location: z.string().max(500).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(['active', 'completed', 'on_hold', 'cancelled']).optional(),
    latitude: z.number().min(-90).max(90).nullish(),
    longitude: z.number().min(-180).max(180).nullish(),
  })
  .strict()

export async function updateProject(input: z.input<typeof projectUpdateSchema>): Promise<Project> {
  await requireRole(['admin'])
  const parsed = projectUpdateSchema.parse(input)
  const supabase = await createClient()

  const { data: existing, error: readError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', parsed.projectId)
    .single()

  if (readError || !existing) throw new Error('Project not found')

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.name !== undefined) updates.name = parsed.name
  if (parsed.location !== undefined) updates.location = parsed.location
  if (parsed.description !== undefined) updates.description = parsed.description
  if (parsed.status !== undefined) updates.status = parsed.status

  if (parsed.latitude !== undefined || parsed.longitude !== undefined) {
    const lat = parsed.latitude ?? existing.latitude ?? null
    const lng = parsed.longitude ?? existing.longitude ?? null
    if (lat != null && lng != null) {
      updates.geom = `SRID=4326;POINT(${lng} ${lat})`
    }
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', parsed.projectId)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to update project')

  await recordAuditEvent({
    action: 'project.update',
    entityType: 'project',
    entityId: parsed.projectId,
    before: existing as Record<string, unknown>,
    after: updates,
  })

  return data as Project
}

export async function setProjectArchived(projectId: string, archived: boolean): Promise<Project> {
  const { userId } = await requireRole(['admin'])
  const id = uuid.parse(projectId)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('projects')
    .update({
      archived_at: archived ? new Date().toISOString() : null,
      archived_by: archived ? userId : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to archive project')

  await recordAuditEvent({
    action: archived ? 'project.archive' : 'project.restore',
    entityType: 'project',
    entityId: id,
  })

  return data as Project
}
