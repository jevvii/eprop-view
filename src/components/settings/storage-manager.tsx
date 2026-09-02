'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  getStorageSummary,
  listStorageAuditObjects,
  deleteStorageObject,
  updateStorageClass,
  syncStorageAudit,
  applyStorageLifecyclePolicies,
} from '@/app/actions/storage'
import type { StorageSummary, StorageAuditEntry, StorageClass } from '@/app/types'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function StorageManager() {
  const [summary, setSummary] = useState<StorageSummary | null>(null)
  const [objects, setObjects] = useState<StorageAuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBucket, setSelectedBucket] = useState<string>('all')
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isApplyingLifecycle, setIsApplyingLifecycle] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const sum = await getStorageSummary()
      setSummary(sum)
      const list = await listStorageAuditObjects({
        bucketId: selectedBucket !== 'all' ? selectedBucket : undefined,
        storageClass: selectedClass !== 'all' ? (selectedClass as StorageClass) : undefined,
      })
      setObjects(list)
    } catch (err) {
      console.warn('Failed to load storage telemetry:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedBucket, selectedClass])

  const handleSync = async () => {
    setIsSyncing(true)
    setFeedback(null)
    try {
      const res = await syncStorageAudit()
      setFeedback(`Storage sync completed: ${res.synced} objects indexed (${res.orphaned} orphans flagged).`)
      await loadData()
    } catch (err) {
      setFeedback(`Sync error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLifecycle = async () => {
    setIsApplyingLifecycle(true)
    setFeedback(null)
    try {
      const res = await applyStorageLifecyclePolicies()
      setFeedback(
        `Lifecycle policy executed: ${res.archived} objects transitioned to cold storage, ${res.cleaned} stale orphans cleaned (${res.retentionExpired} past 7-year regulatory retention).`
      )
      await loadData()
    } catch (err) {
      setFeedback(`Lifecycle error: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setIsApplyingLifecycle(false)
    }
  }

  const handleDelete = async (bucketId: string, path: string, id: string) => {
    if (!confirm(`Permanently delete object "${path}" from bucket "${bucketId}"?`)) return
    try {
      await deleteStorageObject(bucketId, path, id)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete object')
    }
  }

  const handleChangeClass = async (id: string, newClass: StorageClass) => {
    try {
      await updateStorageClass(id, newClass)
      await loadData()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update class')
    }
  }

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 px-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">
            Object Storage Lifecycle & S3 Manager
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Monitor bucket capacity, tier data to cold archive, and clean orphaned assets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleLifecycle}
            disabled={isApplyingLifecycle}
            variant="outline"
            size="sm"
            className="text-[9px] font-black uppercase tracking-widest px-3 py-2"
          >
            {isApplyingLifecycle ? 'Archiving…' : '📦 Execute 1-Yr Archival'}
          </Button>

          <Button
            onClick={handleSync}
            disabled={isSyncing}
            size="sm"
            className="text-[9px] font-black uppercase tracking-widest px-4 py-2"
          >
            {isSyncing ? 'Indexing…' : '🔄 Sync Storage Audit'}
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-blue-50 text-blue-800 text-xs font-bold rounded-xl border border-blue-200">
          ℹ {feedback}
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Volume</div>
          <div className="text-lg font-black text-slate-900">{formatBytes(summary?.totalBytes || 0)}</div>
          <div className="text-[9px] text-slate-400 font-bold mt-0.5">{summary?.totalObjects || 0} Registered Objects</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Standard Storage</div>
          <div className="text-lg font-black text-slate-900">{formatBytes(summary?.classStats.standard.sizeBytes || 0)}</div>
          <div className="text-[9px] text-slate-400 font-bold mt-0.5">{summary?.classStats.standard.objectCount || 0} Active Files</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Cold & Glacier</div>
          <div className="text-lg font-black text-emerald-600">
            {formatBytes((summary?.classStats.cold.sizeBytes || 0) + (summary?.classStats.archive.sizeBytes || 0))}
          </div>
          <div className="text-[9px] text-slate-400 font-bold mt-0.5">Storj DCS / S3 Glacier</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Orphaned Files</div>
          <div className="text-lg font-black text-amber-600">{summary?.orphanedCount || 0}</div>
          <div className="text-[9px] text-slate-400 font-bold mt-0.5">No DB Association</div>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bucket:</label>
          <select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none"
          >
            <option value="all">All Buckets</option>
            <option value="inspection-images">inspection-images</option>
            <option value="ai-models">ai-models</option>
            <option value="reports-archive">reports-archive</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Class:</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none"
          >
            <option value="all">All Storage Classes</option>
            <option value="standard">Standard (Hot)</option>
            <option value="cold">Cold (Infrequent)</option>
            <option value="archive">Archive (Deep)</option>
          </select>
        </div>
      </div>

      {/* Objects Table */}
      {loading ? (
        <div className="h-40 bg-slate-50 animate-pulse rounded-2xl" />
      ) : objects.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            No storage audit records found matching filters.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Click &quot;Sync Storage Audit&quot; to scan cloud storage buckets.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Object Path</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Bucket</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Size</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Storage Class</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] text-right pr-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {objects.map((obj) => (
                <tr key={obj.id} className="hover:bg-slate-50/50 transition-all">
                  <td className="py-3 pl-2">
                    <div className="font-mono text-xs text-slate-800 truncate max-w-sm">{obj.object_path}</div>
                    {obj.is_orphan && (
                      <span className="text-[8px] font-black uppercase text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        Orphaned
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-xs text-slate-500">{obj.bucket_id}</td>
                  <td className="py-3 text-xs font-mono font-bold text-slate-700">{formatBytes(obj.size_bytes || 0)}</td>
                  <td className="py-3">
                    <select
                      value={obj.storage_class}
                      onChange={(e) => handleChangeClass(obj.id, e.target.value as StorageClass)}
                      className={`text-[9px] font-black uppercase tracking-wider rounded px-2 py-0.5 border ${
                        obj.storage_class === 'archive'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : obj.storage_class === 'cold'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      <option value="standard">Standard</option>
                      <option value="cold">Cold</option>
                      <option value="glacier">Glacier</option>
                      <option value="archive">Archive</option>
                    </select>
                  </td>
                  <td className="py-3 text-right pr-2">
                    <button
                      onClick={() => handleDelete(obj.bucket_id, obj.object_path, obj.id)}
                      className="text-[9px] font-black uppercase tracking-wider text-red-600 hover:text-red-700 bg-red-50 px-2.5 py-1 rounded-lg"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
