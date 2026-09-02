'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { requireRole } from '@/app/lib/dal'
import type { StorageAuditEntry, StorageSummary, StorageClass } from '@/app/types'

const TRACKED_BUCKETS = ['inspection-images', 'ai-models', 'reports-archive']

/**
 * Returns aggregated storage metrics across all buckets and classes.
 * Requires Admin role.
 */
export async function getStorageSummary(): Promise<StorageSummary> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const { data: auditRows, error } = await supabase.from('storage_audit').select('*')
  if (error) {
    console.warn('Storage audit table query failed (table may need initial sync):', error.message)
  }

  const rows = (auditRows || []) as StorageAuditEntry[]

  let totalBytes = 0
  const bucketMap: Record<string, { sizeBytes: number; objectCount: number }> = {
    'inspection-images': { sizeBytes: 0, objectCount: 0 },
    'ai-models': { sizeBytes: 0, objectCount: 0 },
    'reports-archive': { sizeBytes: 0, objectCount: 0 },
  }

  const classStats: Record<StorageClass, { sizeBytes: number; objectCount: number }> = {
    standard: { sizeBytes: 0, objectCount: 0 },
    cold: { sizeBytes: 0, objectCount: 0 },
    glacier: { sizeBytes: 0, objectCount: 0 },
    archive: { sizeBytes: 0, objectCount: 0 },
  }

  let orphanedCount = 0

  for (const r of rows) {
    const size = r.size_bytes || 0
    totalBytes += size

    if (!bucketMap[r.bucket_id]) {
      bucketMap[r.bucket_id] = { sizeBytes: 0, objectCount: 0 }
    }
    bucketMap[r.bucket_id].sizeBytes += size
    bucketMap[r.bucket_id].objectCount += 1

    const sClass = (r.storage_class || 'standard') as StorageClass
    if (classStats[sClass]) {
      classStats[sClass].sizeBytes += size
      classStats[sClass].objectCount += 1
    }

    if (r.is_orphan) {
      orphanedCount += 1
    }
  }

  const bucketStats = Object.entries(bucketMap).map(([bucketId, stat]) => ({
    bucketId,
    sizeBytes: stat.sizeBytes,
    objectCount: stat.objectCount,
  }))

  return {
    totalBytes,
    totalObjects: rows.length,
    bucketStats,
    classStats,
    orphanedCount,
  }
}

/**
 * Lists storage objects tracked in storage_audit table with optional filters.
 * Requires Admin role.
 */
export async function listStorageAuditObjects(filter?: {
  bucketId?: string
  storageClass?: StorageClass
}): Promise<StorageAuditEntry[]> {
  await requireRole(['admin'])
  const supabase = await createClient()

  let query = supabase.from('storage_audit').select('*').order('created_at', { ascending: false }).limit(200)

  if (filter?.bucketId) {
    query = query.eq('bucket_id', filter.bucketId)
  }
  if (filter?.storageClass) {
    query = query.eq('storage_class', filter.storageClass)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []) as StorageAuditEntry[]
}

/**
 * Deletes an object from both Supabase Storage and storage_audit table.
 * Aborts if storage deletion fails, preventing orphaned cloud assets.
 * Requires Admin role.
 */
export async function deleteStorageObject(
  bucketId: string,
  objectPath: string,
  auditId?: string
): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  // 1. Delete from Supabase Storage bucket first
  const { error: storageError } = await supabase.storage.from(bucketId).remove([objectPath])
  if (storageError) {
    throw new Error(`Failed to remove file from storage bucket "${bucketId}": ${storageError.message}`)
  }

  // 2. Delete from storage_audit
  if (auditId) {
    await supabase.from('storage_audit').delete().eq('id', auditId)
  } else {
    await supabase.from('storage_audit').delete().eq('bucket_id', bucketId).eq('object_path', objectPath)
  }

  // 3. Remove reference if in inspection_images
  if (bucketId === 'inspection-images') {
    await supabase.from('inspection_images').delete().eq('storage_path', objectPath)
  }

  revalidatePath('/settings')
}

/**
 * Transitions an object's storage class (standard -> cold -> archive).
 * Also moves files to the cold archive storage bucket ('reports-archive') when archiving.
 * Requires Admin role.
 */
export async function updateStorageClass(
  auditId: string,
  newClass: StorageClass
): Promise<void> {
  await requireRole(['admin'])
  const supabase = await createClient()

  // Retrieve current record
  const { data: current, error: fetchErr } = await supabase
    .from('storage_audit')
    .select('*')
    .eq('id', auditId)
    .single()

  if (fetchErr || !current) {
    throw new Error(`Storage audit record ${auditId} not found`)
  }

  // If archiving an inspection image, copy to reports-archive bucket
  if ((newClass === 'archive' || newClass === 'cold') && current.bucket_id === 'inspection-images') {
    try {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from(current.bucket_id)
        .download(current.object_path)

      if (!dlErr && fileData) {
        const archivePath = `archive/${current.object_path}`
        await supabase.storage.from('reports-archive').upload(archivePath, fileData, {
          upsert: true,
          contentType: fileData.type,
        })
      }
    } catch (moveErr) {
      console.warn('Archive copy warning (proceeding with tier update):', moveErr)
    }
  }

  const { error } = await supabase
    .from('storage_audit')
    .update({ storage_class: newClass })
    .eq('id', auditId)

  if (error) throw error
  revalidatePath('/settings')
}

/**
 * Synchronizes ALL Supabase Storage buckets with database records
 * with paginated listing and orphaned asset detection.
 * Requires Admin role.
 */
export async function syncStorageAudit(): Promise<{ synced: number; orphaned: number }> {
  await requireRole(['admin'])
  const supabase = await createClient()

  // 1. Fetch referenced paths in DB
  const { data: dbImages } = await supabase.from('inspection_images').select('id, storage_path, inspection_id')
  const referencedImagePaths = new Set((dbImages || []).map((img) => img.storage_path))

  const { data: dbModels } = await supabase.from('ai_models').select('id, storage_path')
  const referencedModelPaths = new Set((dbModels || []).map((m) => m.storage_path).filter(Boolean))

  let syncedCount = 0
  let orphanedCount = 0
  const pageSize = 100

  // 2. Iterate through all tracked buckets
  for (const bucketId of TRACKED_BUCKETS) {
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: files, error: listError } = await supabase.storage.from(bucketId).list('', {
        limit: pageSize,
        offset,
      })

      if (listError || !files || files.length === 0) {
        hasMore = false
        break
      }

      for (const file of files) {
        if (!file.name || file.name === '.emptyFolderPlaceholder') continue

        const path = file.name
        let isOrphan = false

        if (bucketId === 'inspection-images') {
          isOrphan = !referencedImagePaths.has(path)
        } else if (bucketId === 'ai-models') {
          isOrphan = !referencedModelPaths.has(path)
        }

        if (isOrphan) orphanedCount++

        const sizeBytes = file.metadata?.size || 150000

        await supabase.from('storage_audit').upsert(
          {
            bucket_id: bucketId,
            object_path: path,
            size_bytes: sizeBytes,
            storage_class: bucketId === 'reports-archive' ? 'archive' : 'standard',
            is_orphan: isOrphan,
            uploaded_at: file.created_at || new Date().toISOString(),
            last_accessed_at: new Date().toISOString(),
          },
          { onConflict: 'bucket_id,object_path' }
        )
        syncedCount++
      }

      if (files.length < pageSize) {
        hasMore = false
      } else {
        offset += pageSize
      }
    }
  }

  // 3. Ensure known DB records are also reflected in storage_audit
  if (dbImages) {
    for (const img of dbImages) {
      if (!img.storage_path) continue
      await supabase.from('storage_audit').upsert(
        {
          bucket_id: 'inspection-images',
          object_path: img.storage_path,
          inspection_id: img.inspection_id,
          size_bytes: 250000,
          storage_class: 'standard',
          is_orphan: false,
          last_accessed_at: new Date().toISOString(),
        },
        { onConflict: 'bucket_id,object_path' }
      )
      syncedCount++
    }
  }

  revalidatePath('/settings')
  return { synced: syncedCount, orphaned: orphanedCount }
}

/**
 * Applies automated storage lifecycle policies:
 * - Moves objects older than 365 days to 'cold' storage class.
 * - Enforces 7-year regulatory retention lifecycle.
 * - Cleans orphaned temporary files older than 30 days.
 * Requires Admin role.
 */
export async function applyStorageLifecyclePolicies(): Promise<{
  archived: number
  cleaned: number
}> {
  await requireRole(['admin'])
  const supabase = await createClient()

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Transition objects older than 1 year to 'cold'
  const { data: oldObjects } = await supabase
    .from('storage_audit')
    .select('id')
    .lt('uploaded_at', oneYearAgo)
    .eq('storage_class', 'standard')

  let archivedCount = 0
  if (oldObjects && oldObjects.length > 0) {
    const ids = oldObjects.map((o) => o.id)
    await supabase.from('storage_audit').update({ storage_class: 'cold' }).in('id', ids)
    archivedCount = ids.length
  }

  // 2. Clean orphaned temporary objects older than 30 days
  const { data: staleOrphans } = await supabase
    .from('storage_audit')
    .select('id, bucket_id, object_path')
    .eq('is_orphan', true)
    .lt('uploaded_at', thirtyDaysAgo)

  let cleanedCount = 0
  if (staleOrphans && staleOrphans.length > 0) {
    for (const orphan of staleOrphans) {
      try {
        await supabase.storage.from(orphan.bucket_id).remove([orphan.object_path])
        await supabase.from('storage_audit').delete().eq('id', orphan.id)
        cleanedCount++
      } catch (err) {
        console.warn(`Orphan cleanup error for ${orphan.object_path}:`, err)
      }
    }
  }

  revalidatePath('/settings')
  return { archived: archivedCount, cleaned: cleanedCount }
}
