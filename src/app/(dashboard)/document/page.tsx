'use client'

import { useState, useEffect, useMemo } from 'react'
import { InspectionForm } from '@/components/document/inspection-form'
import { AssetFeed } from '@/components/document/asset-feed'
import { AssetUpload } from '@/components/document/asset-upload'
import { useInspections } from '@/app/lib/queries'

export default function DocumentPage() {
  const { data: inspections, isLoading } = useInspections()
  const [inspectionId, setInspectionId] = useState('')

  useEffect(() => {
    if (!inspectionId && inspections && inspections.length > 0) {
      setInspectionId(inspections[0].id)
    }
  }, [inspectionId, inspections])

  const selectedInspectionLabel = useMemo(() => {
    if (!inspectionId || !inspections) return null
    const inspection = inspections.find((item) => item.id === inspectionId)
    if (!inspection) return null
    return `${new Date(inspection.inspection_date).toLocaleDateString()} · ${inspection.location}`
  }, [inspectionId, inspections])

  if (isLoading) {
    return <div className="bg-white p-10 rounded-[2.5rem] shadow-xl h-80 animate-pulse border border-slate-100 mx-2" />
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-2">
        <div>
          <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">Asset Vault & Registry</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {selectedInspectionLabel ? `Inspecting ${selectedInspectionLabel}` : 'Manage site imagery and collaborative technical threads.'}
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Filter Entry</label>
          <select
            value={inspectionId}
            onChange={(event) => setInspectionId(event.target.value)}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 transition-all min-w-[200px]"
          >
            <option value="">SELECT_INSPECTION</option>
            {inspections?.map((inspection) => (
              <option key={inspection.id} value={inspection.id}>
                {new Date(inspection.inspection_date).toLocaleDateString()} · {inspection.location}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Left Column: Asset Feed (Primary) */}
        <div className="order-2 lg:order-1">
          <AssetFeed inspectionId={inspectionId} label={selectedInspectionLabel} />
        </div>

        {/* Right Column: Controls & Forms (Supporting) */}
        <div className="space-y-8 order-1 lg:order-2">
          <AssetUpload inspectionId={inspectionId} />
          <div className="opacity-80 hover:opacity-100 transition-opacity">
            <InspectionForm />
          </div>
        </div>
      </div>
    </div>
  )
}
