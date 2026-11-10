'use client'

import { useDashboardStats, useProfile } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'
import { AccessDenied } from '@/components/shared/require-role'
import { StatCard } from '@/components/dashboard/stats-cards'
import { DamageTrendChart } from '@/components/dashboard/damage-trend-chart'
import { GeospatialMap } from '@/components/dashboard/geospatial-map'
import { MaintenanceTable } from '@/components/dashboard/maintenance-table'
import { RiskHotspots } from '@/components/dashboard/risk-hotspots'

export default function DashboardPage() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: stats } = useDashboardStats()

  const canViewDashboard = hasCapability(profile?.role, 'dashboard:view')

  if (profileLoading) {
    return <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-3xl shadow-xl h-80 animate-pulse border border-slate-100 mx-2" />
  }

  if (profile && !canViewDashboard) {
    return (
      <AccessDenied
        title="Dashboard Access Restricted"
        message="The executive health overview and geospatial dashboard is restricted to Structural Engineers and System Administrators. Inspectors can access the Document Vault to submit inspection findings."
        returnHref="/document"
        returnLabel="Go to Document Vault"
      />
    )
  }

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100dvh-81px)] w-full overflow-y-auto lg:overflow-hidden bg-brand-gray min-w-0">
      {/* ── MOBILE FLOW (< lg): Stacks cleanly without horizontal scroll or overlaps ── */}
      <div className="lg:hidden flex flex-col w-full space-y-4 p-4 min-w-0">
        {/* Mobile Stats: 2x2 Grid */}
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full">
          <StatCard label="Active Projects" value={stats?.active_projects ?? 0} />
          <StatCard label="Critical Risk" value={stats?.critical_risk_reports ?? 0} variant="critical" />
          <StatCard label="In Review" value={stats?.reports_in_review ?? 0} variant="info" />
          <StatCard label="Completed" value={stats?.completed_repairs ?? 0} variant="success" />
        </div>

        {/* Mobile Map */}
        <div className="h-[340px] sm:h-[420px] w-full rounded-2xl overflow-hidden shadow-md border border-slate-200/80 relative">
          <GeospatialMap />
        </div>

        {/* Mobile Trend Chart */}
        <div className="w-full">
          <DamageTrendChart className="h-64 shadow-md" />
        </div>

        {/* Mobile Sector Hotspots & Maintenance Priorities */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-slate-100 space-y-8">
          <RiskHotspots />
          <div className="border-t border-slate-100 pt-6">
            <MaintenanceTable />
          </div>
        </div>

        {/* Mobile Global Status */}
        <div className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center justify-between shadow-xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Global Status</div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Systems Nominal</span>
          </div>
        </div>
      </div>

      {/* ── DESKTOP FLOW (>= lg): Desktop Map + Floating Overlays Canvas ── */}
      <div className="hidden lg:flex flex-1 relative min-h-0 bg-slate-200 overflow-hidden">
        <GeospatialMap />

        {/* Top Floating Stats (Desktop) */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center justify-center gap-3 xl:gap-4 w-full max-w-5xl px-6">
          <StatCard 
            label="Active Projects" 
            value={stats?.active_projects ?? 0} 
            isFloating
            className="w-44 xl:w-52 pointer-events-auto shadow-2xl"
          />
          <StatCard 
            label="Critical Risk Reports" 
            value={stats?.critical_risk_reports ?? 0} 
            variant="critical"
            isFloating
            className="w-44 xl:w-52 pointer-events-auto shadow-2xl"
          />
          <StatCard 
            label="Reports In Review" 
            value={stats?.reports_in_review ?? 0} 
            variant="info"
            isFloating
            className="w-44 xl:w-52 pointer-events-auto shadow-2xl"
          />
          <StatCard 
            label="Completed Repairs" 
            value={stats?.completed_repairs ?? 0} 
            variant="success"
            isFloating
            className="w-44 xl:w-52 pointer-events-auto shadow-2xl"
          />
        </div>

        {/* Bottom Floating Chart (Desktop) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none w-full px-6 max-w-4xl">
          <div className="pointer-events-auto">
            <DamageTrendChart
              isFloating
              className="h-48 shadow-2xl"
            />
          </div>
        </div>
      </div>

      {/* ── DESKTOP RIGHT ASIDE (>= lg): Scrollable Hotspots & Maintenance ── */}
      <aside className="hidden lg:flex w-[380px] xl:w-[420px] bg-white border-l border-slate-100 flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.02)] min-h-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar overscroll-contain">
          <RiskHotspots />
          <MaintenanceTable />
        </div>
        
        {/* Desktop Bottom Panel Summary */}
        <div className="p-5 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Global Status</div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Systems Nominal</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
