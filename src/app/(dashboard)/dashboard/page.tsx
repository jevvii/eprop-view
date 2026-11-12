'use client'

import { useDashboardStats, useProfile, useSettlementOverview } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'
import { AccessDenied } from '@/components/shared/require-role'
import { StatCard } from '@/components/dashboard/stats-cards'
import { DamageTrendChart } from '@/components/dashboard/damage-trend-chart-lazy'
import { GeospatialMap } from '@/components/dashboard/geospatial-map-lazy'
import { MaintenanceTable } from '@/components/dashboard/maintenance-table'
import { RiskHotspots } from '@/components/dashboard/risk-hotspots'

function ConnectionStatus({
  isLoading,
  isError,
}: {
  isLoading: boolean
  isError: boolean
}) {
  const state = isError
    ? { label: 'Data unavailable', dot: 'bg-red-500', text: 'text-red-700' }
    : isLoading
      ? { label: 'Loading data', dot: 'bg-slate-400', text: 'text-slate-600' }
      : { label: 'Data connected', dot: 'bg-emerald-500', text: 'text-emerald-700' }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Data status</span>
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden="true" />
        <span className={`text-xs font-semibold ${state.text}`} role="status">
          {state.label}
        </span>
      </span>
    </div>
  )
}

export default function DashboardPage() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const {data: movement,isError: movementError}=useSettlementOverview()
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDashboardStats()

  const canViewDashboard = hasCapability(profile?.role, 'dashboard:view')

  if (profileLoading) {
    return (
      <div
        className="bg-white p-6 sm:p-10 rounded-lg shadow-sm h-80 animate-pulse border border-slate-100 mx-2"
        aria-busy="true"
        aria-label="Loading dashboard"
      />
    )
  }

  if (profile && !canViewDashboard) {
    return (
      <AccessDenied
        title="Dashboard access restricted"
        message="The health overview and geospatial dashboard is available to structural engineers and administrators. Inspectors can submit findings in the document vault."
        returnHref="/document"
        returnLabel="Go to document vault"
      />
    )
  }

  const value = (
    key: 'active_projects' | 'critical_risk_reports' | 'reports_in_review' | 'completed_repairs'
  ) => (statsLoading ? '—' : (stats?.[key] ?? 0))

  return (
    <div className="flex flex-col min-h-0 lg:h-full"><div className="flex flex-1 flex-col lg:flex-row w-full min-w-0 min-h-0 bg-background">
      {/* One map instance for both layouts. Previously the mobile and desktop
          branches mounted two Mapbox WebGL contexts per page load. */}
      <section className="relative flex flex-1 flex-col min-w-0 min-h-0">
        <div className="p-4 pb-0 lg:p-0 lg:absolute lg:top-5 lg:left-1/2 lg:-translate-x-1/2 lg:z-10 lg:w-full lg:max-w-5xl lg:px-6">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:flex lg:justify-center">
            <StatCard
              label="Active projects"
              value={value('active_projects')}
              className="lg:w-44 xl:w-52 lg:shadow-lg"
            />
            <StatCard
              label="Critical risk"
              value={value('critical_risk_reports')}
              variant="critical"
              className="lg:w-44 xl:w-52 lg:shadow-lg"
            />
            <StatCard
              label="In review"
              value={value('reports_in_review')}
              variant="info"
              className="lg:w-44 xl:w-52 lg:shadow-lg"
            />
            <StatCard
              label="Completed"
              value={value('completed_repairs')}
              variant="success"
              className="lg:w-44 xl:w-52 lg:shadow-lg"
            />
          </div>
        </div>

        <div className="mx-4 mt-4 lg:m-0 h-[340px] sm:h-[420px] lg:h-auto lg:flex-1 overflow-hidden rounded-lg lg:rounded-none border border-slate-200/70 lg:border-0">
          <GeospatialMap />
        </div>

        <div className="px-4 py-4 lg:p-0 lg:absolute lg:bottom-5 lg:left-1/2 lg:-translate-x-1/2 lg:z-10 lg:w-full lg:max-w-4xl lg:px-6">
          <DamageTrendChart className="h-72 lg:h-64" />
        </div>
      </section>

      <aside className="w-full lg:w-[380px] xl:w-[420px] shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-slate-200/70 flex flex-col min-h-0">
        <div className="flex-1 lg:overflow-y-auto p-4 sm:p-6 space-y-8 overscroll-contain">
          <section aria-label="Building movement" className="rounded-xl border border-slate-200 p-3 space-y-2">
            <h2 className="text-sm font-bold">Tilt and settlement</h2>
            {movementError?<p role="alert" className="text-xs text-red-700">Movement readings unavailable. Check database setup.</p>:<>
              <p className="text-sm font-semibold">{movement?.filter(row=>row.classification==='action_required').length??0} buildings requiring assessment</p>
              {!movement?.length&&<p className="text-xs text-slate-600">No movement measurements recorded.</p>}
              {movement?.map(row=><p key={row.building_id} className="text-xs text-slate-700">{row.building_name}: {row.classification.replaceAll('_',' ')} · tilt {row.tilt_mm_per_m??'not measured'} mm/m · settlement {row.differential_settlement_mm??'not measured'} mm</p>)}
            </>}
          </section>
          <RiskHotspots />
          <MaintenanceTable />
        </div>

        <div className="p-4 border-t border-slate-100">
          <ConnectionStatus isLoading={statsLoading} isError={statsError} />
        </div>
      </aside>
    </div></div>
  )
}
