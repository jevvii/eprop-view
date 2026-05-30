'use client'

import { useDashboardStats } from '@/app/lib/queries'
import { StatCard } from '@/components/dashboard/stats-cards'
import { DamageTrendChart } from '@/components/dashboard/damage-trend-chart'
import { GeospatialMap } from '@/components/dashboard/geospatial-map'
import { MaintenanceTable } from '@/components/dashboard/maintenance-table'
import { RiskHotspots } from '@/components/dashboard/risk-hotspots'

export default function DashboardPage() {
  const { data: stats } = useDashboardStats()

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-73px)] lg:h-[calc(100vh-81px)] w-full overflow-hidden bg-brand-gray">
      {/* LEFT CANVAS: Map + Floating Overlays */}
      <div className="flex-1 relative min-h-[400px] lg:min-h-0 bg-slate-200">
        <GeospatialMap />

        {/* Top Floating Stats */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center justify-center gap-4 w-full px-8">
          <StatCard 
            label="Active Projects" 
            value={stats?.active_projects ?? 0} 
            isFloating
            className="w-48 pointer-events-auto shadow-2xl"
          />
          <StatCard 
            label="Critical Risk Reports" 
            value={stats?.critical_risk_reports ?? 0} 
            variant="critical"
            isFloating
            className="w-48 pointer-events-auto shadow-2xl"
          />
          <StatCard 
            label="Reports In Review" 
            value={stats?.reports_in_review ?? 0} 
            variant="info"
            isFloating
            className="w-48 pointer-events-auto shadow-2xl"
          />
          <StatCard 
            label="Completed Repairs" 
            value={stats?.completed_repairs ?? 0} 
            variant="success"
            isFloating
            className="w-48 pointer-events-auto shadow-2xl"
          />
        </div>

        {/* Bottom Floating Chart */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 pointer-events-none w-full px-8 max-w-4xl">
          <div className="pointer-events-auto">
            <DamageTrendChart 
              isFloating 
              className="h-64 shadow-2xl"
            />
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Fixed Lists */}
      <aside className="w-full lg:w-[400px] bg-white border-l border-slate-100 flex flex-col z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.02)]">
        <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
          <RiskHotspots />
          <MaintenanceTable />
        </div>
        
        {/* Bottom Panel Summary */}
        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Status</div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Systems Nominal</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
