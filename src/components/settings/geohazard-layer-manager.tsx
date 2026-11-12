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
    <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-lg sm:rounded-lg border border-slate-200 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h3 className="text-xs font-bold text-slate-600 mb-1">
            Geohazard Layer Management (GIS)
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Upload GeoJSON & Shapefile datasets (fault lines, flood zones, liquefaction).
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="text-base sm:text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 min-h-[38px] outline-none"
          >
            <option value="">All Projects (Global)</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <label className="cursor-pointer">
            <span className="text-xs font-bold bg-primary text-white px-4 py-2.5 min-h-[38px] rounded-xl hover:bg-primary/90 transition-all inline-flex items-center">
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
          {uploadMessage}
        </div>
      )}

      {uploadError && (
        <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200">
          {uploadError}
        </div>
      )}

      {isLoading ? (
        <div className="h-32 bg-slate-50 animate-pulse rounded-lg" />
      ) : !zones || zones.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
          <p className="text-xs font-bold text-slate-500">
            No geohazard layers uploaded yet.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Upload GeoJSON or ESRI Shapefile datasets to visualize fault traces and flood risks.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="py-3 font-bold text-xs text-slate-600 pl-2">Layer Name</th>
                <th className="py-3 font-bold text-xs text-slate-600">Hazard Classification</th>
                <th className="py-3 font-bold text-xs text-slate-600">Risk Tier</th>
                <th className="py-3 font-bold text-xs text-slate-600">Source File & Format</th>
                <th className="py-3 font-bold text-xs text-slate-600 text-right pr-2">Status & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {zones.map((zone) => (
                <tr key={zone.id} className="hover:bg-slate-50/70 transition-all">
                  <td className="py-4 pl-2 font-bold text-slate-900">
                    {zone.name}
                    {zone.description && (
                      <div className="text-xs font-normal text-slate-500 max-w-xs truncate">{zone.description}</div>
                    )}
                  </td>
                  <td className="py-4">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700">
                      {zone.zone_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-4">
 <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                      zone.risk_level === 'zone_a' ? 'bg-red-100 text-red-700' :
                      zone.risk_level === 'zone_b' ? 'bg-amber-100 text-amber-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {zone.risk_level.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-4 text-xs font-mono text-slate-600">
                    {zone.source_file || 'Manual Geometry'}
                    {zone.source_format && (
                      <span className="ml-1.5 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs font-semibold">
                        {zone.source_format}
                      </span>
                    )}
                  </td>
                  <td className="py-4 text-right pr-2 space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => handleToggle(zone.id, zone.is_active)}
 className={`text-xs font-bold px-3 py-1.5 min-h-[32px] rounded-lg border transition-colors ${
                        zone.is_active !== false
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                    >
                      {zone.is_active !== false ? 'Visible' : 'Hidden'}
                    </button>
                    <button
                      onClick={() => handleDelete(zone.id)}
                      className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 min-h-[32px] rounded-lg transition-colors"
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
