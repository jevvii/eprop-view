'use server'

import { createHash } from 'node:crypto'
import { readAllRows } from '@/app/lib/record-export'
import { resolveEvidenceLocation } from '@/app/lib/storage-location'
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

  const rows = await readAllRows<StorageAuditEntry>((from, to) =>
    supabase.from('storage_audit').select('*').order('id').range(from, to)
  )

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

  if (!TRACKED_BUCKETS.includes(bucketId) || !objectPath || objectPath.startsWith('/') || objectPath.split('/').includes('..')) {
    throw new Error('Invalid storage object location.')
  }
  if (bucketId === 'inspection-images' || bucketId === 'reports-archive') {
    const [images, anchors] = await Promise.all([
      supabase.from('inspection_images').select('id').eq('storage_bucket', bucketId).eq('storage_path', objectPath),
      supabase.from('ar_anchors').select('id').eq('snapshot_bucket', bucketId).eq('snapshot_path', objectPath),
    ])
    if (images.error || anchors.error) throw images.error ?? anchors.error
    if (images.data?.length || anchors.data?.length) throw new Error('This file is linked to inspection evidence. Remove the owning evidence record before deleting its file.')
  } else {
    const { data: models, error } = await supabase.from('ai_models').select('id').eq('storage_path', objectPath)
    if (error) throw error
    if (models?.length) throw new Error('This file is linked to a model registry entry.')
  }
  const { error: storageError } = await supabase.storage.from(bucketId).remove([objectPath])
  if (storageError) throw new Error(`Storage deletion failed: ${storageError.message}`)
  let deletion = supabase.from('storage_audit').delete().eq('bucket_id', bucketId).eq('object_path', objectPath)
  if (auditId) deletion = deletion.eq('id', auditId)
  const { error: auditError } = await deletion
  if (auditError) throw auditError

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

  if (!['standard', 'cold', 'archive'].includes(newClass)) {
    throw new Error('Glacier requires an external storage provider and is not available in this capstone.')
  }

  if ((newClass === 'archive' || newClass === 'cold') && current.bucket_id === 'inspection-images') {
    const { data: original, error: downloadError } = await supabase.storage
      .from(current.bucket_id).download(current.object_path)
    if (downloadError || !original) throw new Error('Could not download original evidence for archival.')

    const archivePath = `archive/${current.id}/${current.object_path}`
    const archiveBucket = supabase.storage.from('reports-archive')
    const { error: uploadError } = await archiveBucket.upload(archivePath, original, {
      upsert: false,
      contentType: original.type,
    })
    // A previous attempt may have staged this exact copy before a database error.
    if (uploadError && String(uploadError.statusCode) !== '409') {
      throw new Error(`Archive upload failed: ${uploadError.message}. Original evidence retained.`)
    }

    const { data: copy, error: copyError } = await archiveBucket.download(archivePath)
    const digest = async (file: Blob) => createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex')
    if (copyError || !copy || copy.size !== original.size || await digest(copy) !== await digest(original)) {
      throw new Error('Archive copy verification failed. Original evidence retained.')
    }

    // The RPC atomically moves every image/AR pointer and the audit location.
    // A failed transaction leaves the old pointer and original bytes intact.
    const { error: metadataError } = await supabase.rpc('commit_storage_archive', {
      p_audit_id: current.id,
      p_expected_bucket: current.bucket_id,
      p_expected_path: current.object_path,
      p_bucket_id: 'reports-archive',
      p_object_path: archivePath,
      p_storage_class: newClass,
      p_size_bytes: copy.size,
    })
    if (metadataError) throw new Error(`Archive metadata update failed: ${metadataError.message}. Original evidence retained.`)

    // Only delete after both the bytes and all readers point to the verified copy.
    const { error: cleanupError } = await supabase.storage.from(current.bucket_id).remove([current.object_path])
    revalidatePath('/settings')
    if (cleanupError) throw new Error('Archive saved, but original cleanup failed. Both copies were retained; retry cleanup from Storage.')
    return
  }

  const { error } = await supabase.from('storage_audit').update({ storage_class: newClass }).eq('id', auditId)
  if (error) throw error
  revalidatePath('/settings')
}

/**
 * Synchronizes ALL Supabase Storage buckets with database records
 * with paginated listing and orphaned asset detection.
 * Convention: 'reports-archive' bucket stores cold/archival objects; others are standard.
 * Requires Admin role.
 */
export async function syncStorageAudit(): Promise<{ synced: number; orphaned: number }> {
  await requireRole(['admin'])
  const supabase = await createClient()
  const [images, anchors, models, existing] = await Promise.all([
    readAllRows<{ id: string; storage_bucket?: string; storage_path: string; inspection_id: string }>((from, to) =>
      supabase.from('inspection_images').select('id, storage_bucket, storage_path, inspection_id').order('id').range(from, to)),
    readAllRows<{ snapshot_bucket?: string; snapshot_path: string | null; inspection_id: string }>((from, to) =>
      supabase.from('ar_anchors').select('snapshot_bucket, snapshot_path, inspection_id').order('id').range(from, to)),
    readAllRows<{ storage_path: string | null }>((from, to) =>
      supabase.from('ai_models').select('storage_path').order('id').range(from, to)),
    readAllRows<StorageAuditEntry>((from, to) =>
      supabase.from('storage_audit').select('*').order('id').range(from, to)),
  ])
  const referenced = new Map<string, { inspection_id?: string }>()
  for (const image of images) {
    const location = resolveEvidenceLocation(image)
    referenced.set(`${location.bucket}/${location.path}`, { inspection_id: image.inspection_id })
  }
  for (const anchor of anchors) {
    if (!anchor.snapshot_path) continue
    const location = resolveEvidenceLocation(anchor)
    referenced.set(`${location.bucket}/${location.path}`, { inspection_id: anchor.inspection_id })
  }
  for (const model of models) {
    if (model.storage_path) referenced.set(`ai-models/${model.storage_path}`, {})
  }

  let synced = 0, orphaned = 0
  const seen = new Set<string>()
  const scan = async (bucket: string, prefix = '', depth = 0): Promise<void> => {
    if (depth > 16) throw new Error('Storage folder depth exceeds the supported scan limit.')
    for (let offset = 0; ; offset += 100) {
      const { data: entries, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(`Storage scan failed for ${bucket}: ${error.message}`)
      if (!entries) throw new Error(`Storage scan returned no result for ${bucket}.`)
      for (const entry of entries) {
        if (!entry.name || entry.name === '.emptyFolderPlaceholder') continue
        const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.id == null) { await scan(bucket, objectPath, depth + 1); continue }
        const key = `${bucket}/${objectPath}`, link = referenced.get(key)
        const isOrphan = !referenced.has(key)
        let bytes = Number(entry.metadata?.size)
        if (!Number.isFinite(bytes) || bytes < 0) {
          const { data: file, error: fileError } = await supabase.storage.from(bucket).download(objectPath)
          if (fileError || !file) throw new Error(`Could not measure storage object ${objectPath}.`)
          bytes = file.size
        }
        const previous = existing.find(row => row.bucket_id === bucket && row.object_path === objectPath)
        const { error: writeError } = await supabase.from('storage_audit').upsert({
          bucket_id: bucket, object_path: objectPath, size_bytes: bytes,
          storage_class: previous?.storage_class ?? (bucket === 'reports-archive' ? 'archive' : 'standard'),
          is_orphan: isOrphan, inspection_id: link?.inspection_id ?? null,
          uploaded_at: entry.created_at ?? previous?.uploaded_at ?? new Date().toISOString(),
        }, { onConflict: 'bucket_id,object_path' })
        if (writeError) throw writeError
        seen.add(key)
        synced++
        if (isOrphan) orphaned++
      }
      if (entries.length < 100) break
    }
  }
  for (const bucket of TRACKED_BUCKETS) await scan(bucket)
  // Missing referenced files are a data-integrity error, never fabricated assets.
  const missing = [...referenced.keys()].filter(key => !seen.has(key))
  if (missing.length) throw new Error(`${missing.length} referenced storage objects are missing. Repair evidence before running retention cleanup.`)
  for (const old of existing) {
    const key = `${old.bucket_id}/${old.object_path}`
    if (seen.has(key) || referenced.has(key)) continue
    const { error } = await supabase.from('storage_audit').delete().eq('id', old.id)
    if (error) throw error
  }
  revalidatePath('/settings')
  return { synced, orphaned }
}

/** Manual lifecycle run: verified copies, checked deletes, and retention counts. */
export async function applyStorageLifecyclePolicies(): Promise<{ archived: number; cleaned: number; retentionExpired: number }> {
  await requireRole(['admin'])
  const supabase = await createClient()
  // Refresh references first; a stale audit must not authorize evidence deletion.
  await syncStorageAudit()
  const rows = await readAllRows<StorageAuditEntry>((from, to) =>
    supabase.from('storage_audit').select('*').order('id').range(from, to))
  const now = Date.now(), year = 365 * 24 * 60 * 60 * 1000, month = 30 * 24 * 60 * 60 * 1000
  let archived = 0, cleaned = 0
  for (const row of rows) {
    const age = now - new Date(row.uploaded_at).getTime()
    if (!row.is_orphan && row.bucket_id === 'inspection-images' && row.storage_class === 'standard' && age > year) {
      await updateStorageClass(row.id, 'cold')
      archived++
    } else if (row.is_orphan && age > month) {
      await deleteStorageObject(row.bucket_id, row.object_path, row.id)
      cleaned++
    }
  }
  const retentionExpired = rows.filter(row => row.storage_class === 'archive' && now - new Date(row.uploaded_at).getTime() > 7 * year).length
  return { archived, cleaned, retentionExpired }
}
