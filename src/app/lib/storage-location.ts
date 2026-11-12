export interface EvidenceLocation {
  bucket: 'inspection-images' | 'reports-archive'
  path: string
}

/** Both columns travel together: archived evidence is not in the primary bucket. */
export function resolveEvidenceLocation(row: {
  storage_bucket?: string | null
  storage_path?: string | null
  snapshot_bucket?: string | null
  snapshot_path?: string | null
}): EvidenceLocation {
  const bucket = row.storage_bucket ?? row.snapshot_bucket ?? 'inspection-images'
  const path = row.storage_path ?? row.snapshot_path
  if (bucket !== 'inspection-images' && bucket !== 'reports-archive') {
    throw new Error('Unsupported evidence storage bucket.')
  }
  if (!path || path.startsWith('/') || path.split('/').includes('..')) {
    throw new Error('Invalid evidence storage path.')
  }
  return { bucket, path }
}
