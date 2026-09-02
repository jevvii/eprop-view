'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import type { Building, Floor, StructuralElementRecord, StructuralElement } from '@/app/types'

// ==========================================
// 1. Buildings Actions
// ==========================================

export async function getBuildings(projectId?: string): Promise<Building[]> {
  const supabase = await createClient()
  let query = supabase
    .from('buildings')
    .select('*, project:projects(name)')
    .order('name', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((b: any) => ({
    ...b,
    project_name: b.project?.name || '',
  })) as Building[]
}

export async function createBuilding(input: {
  project_id: string
  name: string
  code?: string
  description?: string
  latitude?: number
  longitude?: number
}): Promise<Building> {
  const { userId } = await requireRole(['admin'])
  const supabase = await createClient()

  if (!input.name || !input.name.trim()) {
    throw new Error('Building name is required')
  }
  if (!input.project_id) {
    throw new Error('Project association is required')
  }

  const { data, error } = await supabase
    .from('buildings')
    .insert({
      project_id: input.project_id,
      name: input.name.trim(),
      code: input.code?.trim() || null,
      description: input.description?.trim() || '',
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      created_by: userId,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create building record')
  revalidatePath('/settings')
  revalidatePath('/document')
  return data as Building
}

export async function updateBuilding(
  id: string,
  input: Partial<{
    name: string
    code: string
    description: string
    latitude: number
    longitude: number
  }>
): Promise<Building> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('buildings')
    .update({
      ...input,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to update building record')
  revalidatePath('/settings')
  revalidatePath('/document')
  return data as Building
}

export async function deleteBuilding(id: string): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { error } = await supabase.from('buildings').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/settings')
  revalidatePath('/document')
}

// ==========================================
// 2. Floors Actions
// ==========================================

export async function getFloors(buildingId?: string): Promise<Floor[]> {
  const supabase = await createClient()
  let query = supabase
    .from('floors')
    .select('*, building:buildings(name)')
    .order('sort_order', { ascending: true })

  if (buildingId) {
    query = query.eq('building_id', buildingId)
  }

  const { data, error } = await query
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((f: any) => ({
    ...f,
    building_name: f.building?.name || '',
  })) as Floor[]
}

export async function createFloor(input: {
  building_id: string
  name: string
  level?: number
  sort_order?: number
}): Promise<Floor> {
  await requireRole(['admin'])
  const supabase = await createClient()

  if (!input.name || !input.name.trim()) {
    throw new Error('Floor name is required')
  }

  const { data, error } = await supabase
    .from('floors')
    .insert({
      building_id: input.building_id,
      name: input.name.trim(),
      level: input.level ?? 0,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create floor record')
  revalidatePath('/settings')
  revalidatePath('/document')
  return data as Floor
}

export async function updateFloor(
  id: string,
  input: Partial<{
    name: string
    level: number
    sort_order: number
  }>
): Promise<Floor> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('floors')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to update floor record')
  revalidatePath('/settings')
  revalidatePath('/document')
  return data as Floor
}

export async function deleteFloor(id: string): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { error } = await supabase.from('floors').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/settings')
  revalidatePath('/document')
}

export async function reorderFloors(buildingId: string, orderedFloorIds: string[]): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  for (let i = 0; i < orderedFloorIds.length; i++) {
    const id = orderedFloorIds[i]
    const { error } = await supabase
      .from('floors')
      .update({ sort_order: i })
      .eq('id', id)
      .eq('building_id', buildingId)

    if (error) {
      throw new Error(`Failed to update floor sequence for floor ID ${id}: ${error.message}`)
    }
  }

  revalidatePath('/settings')
}

// ==========================================
// 3. Structural Elements Actions
// ==========================================

export async function getStructuralElements(floorId?: string): Promise<StructuralElementRecord[]> {
  const supabase = await createClient()
  let query = supabase
    .from('structural_elements')
    .select('*, floor:floors(name)')
    .order('identifier', { ascending: true })

  if (floorId) {
    query = query.eq('floor_id', floorId)
  }

  const { data, error } = await query
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((e: any) => ({
    ...e,
    floor_name: e.floor?.name || '',
  })) as StructuralElementRecord[]
}

export async function createStructuralElement(input: {
  floor_id: string
  element_type: StructuralElement
  identifier: string
  description?: string
}): Promise<StructuralElementRecord> {
  await requireRole(['admin'])
  const supabase = await createClient()

  if (!input.identifier || !input.identifier.trim()) {
    throw new Error('Element identifier is required (e.g. Column C-12)')
  }

  const validTypes: StructuralElement[] = [
    'beam',
    'column',
    'slab',
    'wall',
    'foundation',
    'facade',
    'roof',
    'general',
    'other',
  ]
  if (!validTypes.includes(input.element_type)) {
    throw new Error(`Invalid structural element type: ${input.element_type}`)
  }

  const { data, error } = await supabase
    .from('structural_elements')
    .insert({
      floor_id: input.floor_id,
      element_type: input.element_type,
      identifier: input.identifier.trim(),
      description: input.description?.trim() || '',
    })
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to create structural element')
  revalidatePath('/settings')
  revalidatePath('/document')
  return data as StructuralElementRecord
}

export async function updateStructuralElement(
  id: string,
  input: Partial<{
    element_type: StructuralElement
    identifier: string
    description: string
  }>
): Promise<StructuralElementRecord> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('structural_elements')
    .update({
      ...input,
    })
    .eq('id', id)
    .select()
    .single()

  if (error || !data) throw error ?? new Error('Failed to update structural element')
  revalidatePath('/settings')
  revalidatePath('/document')
  return data as StructuralElementRecord
}

export async function deleteStructuralElement(id: string): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { error } = await supabase.from('structural_elements').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/settings')
  revalidatePath('/document')
}

/**
 * Bulk import structural elements from CSV content with automatic deduplication.
 */
export async function importStructuralElementsCSV(
  floorId: string,
  csvContent: string
): Promise<{ created: number; errors: string[] }> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const validTypes: Set<string> = new Set([
    'beam',
    'column',
    'slab',
    'wall',
    'foundation',
    'facade',
    'roof',
    'general',
    'other',
  ])

  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 1) {
    return { created: 0, errors: ['CSV content is empty or contains only header'] }
  }

  // Query existing floor elements to deduplicate against
  const { data: existing } = await supabase
    .from('structural_elements')
    .select('identifier')
    .eq('floor_id', floorId)

  const seen = new Set<string>()
  if (existing) {
    existing.forEach((e) => seen.add(e.identifier.trim().toLowerCase()))
  }

  // Detect header indices
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
  const idIdx = header.indexOf('identifier')
  const typeIdx = header.indexOf('element_type')
  const descIdx = header.indexOf('description')

  const rowsToInsert: {
    floor_id: string
    identifier: string
    element_type: StructuralElement
    description: string
  }[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''))
    const identifier = idIdx !== -1 ? cols[idIdx] : cols[0]
    const rawType = (typeIdx !== -1 ? cols[typeIdx] : cols[1] || 'general').toLowerCase()
    const description = descIdx !== -1 ? cols[descIdx] : cols[2] || ''

    if (!identifier) {
      errors.push(`Row ${i + 1}: Missing identifier`)
      continue
    }

    const key = identifier.trim().toLowerCase()
    if (seen.has(key)) {
      errors.push(`Row ${i + 1}: Identifier "${identifier}" already exists or is duplicate in batch; skipped.`)
      continue
    }
    seen.add(key)

    const element_type = (validTypes.has(rawType) ? rawType : 'general') as StructuralElement
    rowsToInsert.push({
      floor_id: floorId,
      identifier: identifier.trim(),
      element_type,
      description,
    })
  }

  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from('structural_elements').insert(rowsToInsert)
    if (error) {
      errors.push(`Database error: ${error.message}`)
      return { created: 0, errors }
    }
  }

  revalidatePath('/settings')
  revalidatePath('/document')
  return { created: rowsToInsert.length, errors }
}
