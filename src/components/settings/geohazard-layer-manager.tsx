'use client'

import { useState } from 'react'
import { useGeospatialZones, useProjects } from '@/app/lib/queries'
import { Button } from '@/components/ui/button'
import { importGeohazardLayer, toggleGeohazardLayer, deleteGeohazardLayer } from '@/app/actions/geohazard'

export function GeohazardLayerManager() {
  const { data: projects } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const { data: zones, refetch: refetchZones, isLoading } = useGeospatialZones(selectedProjectId || undefined)

  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setUploadMessage(null)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)
    if (selectedProjectId) {
      formData.append('project_id', selectedProjectId)
    }

    try {
      const res = await importGeohazardLayer(formData)
      setUploadMessage(res.message)
      await refetchZones()
      e.target.value = ''
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const handleToggle = async (zoneId: string, currentStatus: boolean | undefined) => {
    try {
      await toggleGeohazardLayer(zoneId, !currentStatus)
      await refetchZones()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle layer')
    }
  }

  const handleDelete = async (zoneId: string) => {
    if (!confirm('Are you sure you want to remove this geohazard layer?')) return
    try {
      await deleteGeohazardLayer(zoneId)
      await refetchZones()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete layer')
    }
  }

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 px-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">
            Geohazard Layer Management (GIS)
          </h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            Upload GeoJSON & Shapefile datasets (fault lines, flood zones, liquefaction).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
          >
            <option value="">All Projects (Global)</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <label className="cursor-pointer">
            <span className="text-[9px] font-black uppercase tracking-widest bg-primary text-white px-4 py-2 rounded-xl shadow-md hover:bg-primary/90 transition-all inline-block">
              {isUploading ? 'Importing…' : '+ Upload Dataset'}
            </span>
            <input
              type="file"
              accept=".geojson,.json,.shp,.zip"
              onChange={handleFileUpload}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {uploadMessage && (
        <div className="p-3 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200">
          ✓ {uploadMessage}
        </div>
      )}

      {uploadError && (
        <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200">
          ✕ {uploadError}
        </div>
      )}

      {isLoading ? (
        <div className="h-32 bg-slate-50 animate-pulse rounded-2xl" />
      ) : !zones || zones.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            No geohazard layers uploaded yet.
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Upload GeoJSON or ESRI Shapefile datasets to visualize fault traces and flood risks.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Layer Name</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Hazard Classification</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Risk Tier</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Source File & Format</th>
                <th className="py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] text-right pr-2">Status & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {zones.map((zone) => (
                <tr key={zone.id} className="hover:bg-slate-50/50 transition-all">
                  <td className="py-4 pl-2 font-black text-slate-800 uppercase tracking-tight">
                    {zone.name}
                    {zone.description && (
                      <div className="text-[9px] font-normal text-slate-400 max-w-xs truncate">{zone.description}</div>
                    )}
                  </td>
                  <td className="py-4">
                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-100 text-slate-700">
                      {zone.zone_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      zone.risk_level === 'zone_a' ? 'bg-red-100 text-red-700' :
                      zone.risk_level === 'zone_b' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {zone.risk_level.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-mono text-slate-500">
                    {zone.source_file || 'Manual Geometry'}
                    {zone.source_format && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded bg-slate-50 border text-[8px] uppercase">
                        {zone.source_format}
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-right pr-2 space-x-2">
                    <button
                      onClick={() => handleToggle(zone.id, zone.is_active)}
                      className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-colors ${
                        zone.is_active !== false
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {zone.is_active !== false ? '● Visible' : '○ Hidden'}
                    </button>
                    <button
                      onClick={() => handleDelete(zone.id)}
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
