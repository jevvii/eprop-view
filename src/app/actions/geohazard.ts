'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import { parseGeoJSON } from '@/app/lib/geo/import-geojson'
import { parseShapefile } from '@/app/lib/geo/import-shapefile'
import { geojsonToWKT } from '@/app/lib/geo/wkt'
import type { GeospatialZone } from '@/app/types'

/**
 * Imports a geohazard dataset (GeoJSON, ESRI Shapefile, or zipped shapefile)
 * and safely upserts features into geospatial_zones using PostGIS geometries.
 * Gated strictly to Admin role.
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
    throw new Error('Unsupported format. Please upload a .geojson, .json, .shp, or .zip shapefile archive.')
  }

  if (parsedZones.length === 0) {
    throw new Error('No valid hazard geometries could be parsed from the uploaded file.')
  }

  const supabase = await createClient()
  let importedCount = 0

  for (const z of parsedZones) {
    const geojsonString = JSON.stringify(z.geom)

    // Attempt RPC upsert with PostGIS ST_GeomFromGeoJSON first
    const { error: rpcError } = await supabase.rpc('upsert_geospatial_zone', {
      p_project_id: projectId,
      p_name: z.name,
      p_zone_type: z.zone_type,
      p_risk_level: z.risk_level,
      p_geojson: geojsonString,
      p_description: z.description || '',
      p_source_file: file.name,
      p_source_format: filename.endsWith('.shp') || filename.endsWith('.zip') ? 'shapefile' : 'geojson',
      p_effective_date: new Date().toISOString().slice(0, 10),
    })

    if (rpcError) {
      // Fallback to direct WKT insertion if RPC is unavailable
      const wkt = geojsonToWKT(z.geom, 4326)
      const { error: insertError } = await supabase.from('geospatial_zones').upsert(
        {
          project_id: projectId,
          name: z.name,
          zone_type: z.zone_type,
          risk_level: z.risk_level,
          geom: wkt as any,
          description: z.description,
          source_file: file.name,
          source_format: filename.endsWith('.shp') || filename.endsWith('.zip') ? 'shapefile' : 'geojson',
          effective_date: new Date().toISOString().slice(0, 10),
          is_active: true,
        },
        { onConflict: 'project_id,name,zone_type' }
      )

      if (insertError) {
        console.warn(`Failed to insert zone "${z.name}":`, insertError.message)
        continue
      }
    }

    importedCount++
  }

  revalidatePath('/settings')
  revalidatePath('/environmental')
  revalidatePath('/dashboard')

  return {
    imported: importedCount,
    message: `Successfully imported ${importedCount} geospatial hazard zones from ${file.name}.`,
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
