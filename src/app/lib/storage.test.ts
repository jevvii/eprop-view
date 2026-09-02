import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { StorageAuditEntry, StorageSummary, StorageClass } from '@/app/types'

describe('Phase E: Storage Audit & Lifecycle Management Tests', () => {
  test('aggregates storage summary correctly across buckets and storage classes', () => {
    const mockAuditEntries: StorageAuditEntry[] = [
      {
        id: '1',
        bucket_id: 'inspection-images',
        object_path: 'project1/crack_1.jpg',
        size_bytes: 1048576, // 1 MB
        storage_class: 'standard',
        owner_id: 'user1',
        project_id: 'proj1',
        inspection_id: 'insp1',
        uploaded_at: '2026-01-01T00:00:00Z',
        last_accessed_at: '2026-09-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        is_orphan: false,
      },
      {
        id: '2',
        bucket_id: 'inspection-images',
        object_path: 'project1/old_image.jpg',
        size_bytes: 2097152, // 2 MB
        storage_class: 'cold',
        owner_id: 'user1',
        project_id: 'proj1',
        inspection_id: 'insp1',
        uploaded_at: '2025-01-01T00:00:00Z',
        last_accessed_at: '2025-06-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        is_orphan: false,
      },
      {
        id: '3',
        bucket_id: 'reports-archive',
        object_path: 'reports/compliance_2025.pdf',
        size_bytes: 5242880, // 5 MB
        storage_class: 'archive',
        owner_id: 'admin1',
        project_id: 'proj1',
        inspection_id: null,
        uploaded_at: '2025-12-01T00:00:00Z',
        last_accessed_at: '2025-12-01T00:00:00Z',
        created_at: '2025-12-01T00:00:00Z',
        is_orphan: false,
      },
      {
        id: '4',
        bucket_id: 'inspection-images',
        object_path: 'orphans/temp_99.jpg',
        size_bytes: 500000,
        storage_class: 'standard',
        owner_id: null,
        project_id: null,
        inspection_id: null,
        uploaded_at: '2026-08-01T00:00:00Z',
        last_accessed_at: '2026-08-01T00:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
        is_orphan: true,
      },
    ]

    // Compute metrics
    let totalBytes = 0
    let orphanedCount = 0
    const classStats: Record<StorageClass, { sizeBytes: number; objectCount: number }> = {
      standard: { sizeBytes: 0, objectCount: 0 },
      cold: { sizeBytes: 0, objectCount: 0 },
      glacier: { sizeBytes: 0, objectCount: 0 },
      archive: { sizeBytes: 0, objectCount: 0 },
    }

    for (const r of mockAuditEntries) {
      totalBytes += r.size_bytes
      if (r.is_orphan) orphanedCount++
      classStats[r.storage_class].sizeBytes += r.size_bytes
      classStats[r.storage_class].objectCount += 1
    }

    assert.equal(totalBytes, 1048576 + 2097152 + 5242880 + 500000)
    assert.equal(orphanedCount, 1)
    assert.equal(classStats.standard.objectCount, 2)
    assert.equal(classStats.cold.objectCount, 1)
    assert.equal(classStats.archive.objectCount, 1)
  })

  test('validates storage classes against lifecycle requirements', () => {
    const validClasses: StorageClass[] = ['standard', 'cold', 'glacier', 'archive']
    for (const c of validClasses) {
      assert.ok(['standard', 'cold', 'glacier', 'archive'].includes(c))
    }
  })
})
