'use server'

import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import type { MaintenancePriority, MaintenanceStatus } from '@/app/types'

interface CreateMaintenanceTaskInput {
  project_id: string
  title: string
  location: string
  risk_score: number
  status: MaintenanceStatus
  assigned_to?: string | null
  due_date?: string | null
  notes?: string
}

/**
 * Create a maintenance task item.
 * Role-gated to Engineer and Admin.
 */
export async function createMaintenanceTaskAction(
  task: CreateMaintenanceTaskInput
): Promise<MaintenancePriority> {
  await requireRole(['engineer', 'admin'])

  if (!task.project_id || !task.title?.trim()) {
    throw new Error('Project ID and title are required to create a maintenance task')
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('maintenance_priorities')
    .insert({
      project_id: task.project_id,
      title: task.title.trim(),
      location: task.location || 'Structural Site',
      risk_score: task.risk_score,
      status: task.status || 'pending',
      assigned_to: task.assigned_to || null,
      due_date: task.due_date || null,
      notes: task.notes || '',
    })
    .select()
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to create maintenance priority task')
  }

  return data as MaintenancePriority
}

/**
 * Update an existing maintenance task.
 * Role-gated to Engineer and Admin.
 */
export async function updateMaintenanceTaskAction(
  id: string,
  updates: Partial<MaintenancePriority>
): Promise<MaintenancePriority> {
  await requireRole(['engineer', 'admin'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('maintenance_priorities')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) {
    throw error ?? new Error('Failed to update maintenance task')
  }

  return data as MaintenancePriority
}
