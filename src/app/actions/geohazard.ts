'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { parseGeoJSON } from '@/app/lib/geo/import-geojson'
import { parseShapefile } from '@/app/lib/geo/import-shapefile'
import type { GeospatialZone } from '@/app/types'

/**
 * Imports a geohazard dataset (GeoJSON or Shapefile) and persists features
 * into geospatial_zones. Gated strictly to Admin role.
 */
export async function importGeohazardLayer(formData: FormData): Promise<{
  imported: number
  message: string
}> {
  await requireRole(['admin'])
  const file = formData.get('file') as File | null
  const projectId = (formData.get('project_id') as string) || null

  if (!file) {
    throw new Error('No dataset file provided in upload')
  }

  const filename = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()

  let parsedZones: ReturnType<typeof parseGeoJSON> = []

  if (filename.endsWith('.geojson') || filename.endsWith('.json')) {
    const text = new TextDecoder('utf-8').decode(buffer)
    parsedZones = parseGeoJSON(text)
  } else if (filename.endsWith('.shp') || filename.endsWith('.zip')) {
    parsedZones = await parseShapefile(buffer, file.name)
  } else {
    throw new Error('Unsupported format. Please upload a .geojson, .json, or .shp file.')
  }

  if (parsedZones.length === 0) {
    throw new Error('No valid hazard geometries could be parsed from the uploaded file.')
  }

  const supabase = await createClient()

  const rows = parsedZones.map((z) => ({
    project_id: projectId,
    name: z.name,
    zone_type: z.zone_type,
    risk_level: z.risk_level,
    coordinates: z.coordinates,
    geom: z.geom,
    description: z.description,
    source_file: file.name,
    source_format: filename.endsWith('.shp') ? 'shapefile' : 'geojson',
    effective_date: new Date().toISOString().slice(0, 10),
    is_active: true,
  }))

  const { error } = await supabase.from('geospatial_zones').insert(rows)
  if (error) {
    throw new Error(`Database insertion failed: ${error.message}`)
  }

  revalidatePath('/settings')
  revalidatePath('/environmental')
  revalidatePath('/dashboard')

  return {
    imported: rows.length,
    message: `Successfully imported ${rows.length} geospatial hazard zones from ${file.name}.`,
  }
}

/**
 * Toggles visibility / active status of a geohazard zone layer.
 */
export async function toggleGeohazardLayer(zoneId: string, isActive: boolean): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('geospatial_zones')
    .update({ is_active: isActive })
    .eq('id', zoneId)

  if (error) throw error
  revalidatePath('/settings')
  revalidatePath('/environmental')
  revalidatePath('/dashboard')
}

/**
 * Deletes a geohazard zone record.
 */
export async function deleteGeohazardLayer(zoneId: string): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { error } = await supabase.from('geospatial_zones').delete().eq('id', zoneId)
  if (error) throw error
  revalidatePath('/settings')
  revalidatePath('/environmental')
  revalidatePath('/dashboard')
}

/**
 * Retrieves all geohazard layers.
 */
export async function getGeohazardLayers(projectId?: string): Promise<GeospatialZone[]> {
  const supabase = await createClient()
  let query = supabase.from('geospatial_zones').select('*').order('created_at', { ascending: false })

  if (projectId) {
    query = query.or(`project_id.eq.${projectId},project_id.is.null`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []) as GeospatialZone[]
}
