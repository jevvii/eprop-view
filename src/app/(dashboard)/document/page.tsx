'use client'

import { WorkspaceFilterBar, useReportFilters } from '@/components/shared/report-filters'
import {
  INSPECTION_FILTER_FIELDS,
  filterInspections,
} from '@/app/lib/workspace-filtering'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ScanLine, Microscope } from 'lucide-react'
import { InspectionForm } from '@/components/document/inspection-form'
import { AssetFeed } from '@/components/document/asset-feed'
import { AssetUpload } from '@/components/document/asset-upload'
import { StructuralTabs } from '@/components/structural/structural-tabs'
import { useInspections, useProfile } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'

export default function DocumentPage() {
  const { data: profile } = useProfile()
  const { data: inspections, isLoading } = useInspections()
  const { filters } = useReportFilters()
  const [inspectionId, setInspectionId] = useState('')

  // Filtering happens in memory; the fetch no longer depends on it.
  const visibleInspections = useMemo(
    () => filterInspections(inspections, filters),
    [inspections, filters]
  )

  const canCreateInspection = hasCapability(profile?.role, 'inspection:create')
  const canUpload = hasCapability(profile?.role, 'image:upload')
  const canUseAR = hasCapability(profile?.role, 'ar:use')

  useEffect(() => {
    if (!inspectionId && visibleInspections.length > 0) {
      setInspectionId(visibleInspections[0].id)
    }
  }, [inspectionId, visibleInspections])

  const selectedInspectionLabel = useMemo(() => {
    if (!inspectionId || !inspections) return null
    const inspection = inspections.find((item) => item.id === inspectionId)
    if (!inspection) return null
    return `${new Date(inspection.inspection_date).toLocaleDateString()} · ${inspection.location}`
  }, [inspectionId, inspections])

  const selectedInspection = useMemo(() => {
    if (!inspectionId || !inspections) return null
    return inspections.find((item) => item.id === inspectionId) ?? null
  }, [inspectionId, inspections])

  if (isLoading) {
    return <div className="bg-white p-6 sm:p-10 rounded-lg sm:rounded-lg shadow-sm h-80 animate-pulse border border-slate-200 mx-2" />
  }

  return (
    <div className="space-y-6 sm:space-y-8"><WorkspaceFilterBar fields={INSPECTION_FILTER_FIELDS} />
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-koulen text-xl text-primary uppercase tracking-wide sm:text-2xl">Asset Vault & Registry</h2>
          <p className="mt-1 max-w-prose text-sm text-slate-600">
            {selectedInspectionLabel ? `Inspecting ${selectedInspectionLabel}` : 'Manage site imagery and collaborative technical threads.'}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex w-full items-center gap-2 text-sm text-slate-600 sm:w-auto">
            Inspection
            <select
              value={inspectionId}
              onChange={(event) => setInspectionId(event.target.value)}
              className="h-10 min-w-[200px] flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium sm:flex-initial"
            >
              <option value="">SELECT_INSPECTION</option>
              {visibleInspections.map((inspection) => (
                <option key={inspection.id} value={inspection.id}>
                  {new Date(inspection.inspection_date).toLocaleDateString()} · {inspection.location}
                </option>
              ))}
            </select>
          </label>

          {canUseAR && inspectionId && (
            <Link
              href={`/ar?inspectionId=${encodeURIComponent(inspectionId)}`}
              className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-colors min-h-[44px]"
            >
              <ScanLine className="h-4 w-4" aria-hidden="true" />
              <span>Launch AR inspection</span>
            </Link>
          )}
        </div>
      </div>

      <StructuralTabs inspection={selectedInspection} />

      <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-[1.6fr_1fr]">
        {/* Feed first on mobile: inspectors open the vault to review evidence. */}
        <div className="order-1 lg:order-1 min-w-0">
          <AssetFeed inspectionId={inspectionId} label={selectedInspectionLabel} />
        </div>

        {/* Controls and forms second. */}
        <div className="space-y-6 sm:space-y-8 order-2 lg:order-2 min-w-0">
          {canUpload && <AssetUpload inspectionId={inspectionId} />}
          {canCreateInspection && (
            <div className="opacity-95 hover:opacity-100 transition-opacity">
              <InspectionForm />
            </div>
          )}
          {!canUpload && !canCreateInspection && (
            <div className="bg-white p-6 sm:p-8 rounded-lg sm:rounded-lg shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center gap-3">
                <Microscope className="h-6 w-6 text-slate-500" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Engineering Review Mode</h3>
                  <p className="text-xs font-semibold text-slate-500">Inspection Vault Read-Only</p>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
                As an engineer, you have full authority to inspect site imagery, validate AI defect detections, adjust severities, and assign maintenance priorities. Field photo injection and inspection creation are restricted to field inspectors.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
