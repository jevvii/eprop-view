import { StatsCards } from '@/components/dashboard/stats-cards'
import { DamageTrendChart } from '@/components/dashboard/damage-trend-chart'
import { GeospatialMap } from '@/components/dashboard/geospatial-map'
import { MaintenanceTable } from '@/components/dashboard/maintenance-table'
import { RiskHotspots } from '@/components/dashboard/risk-hotspots'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <StatsCards />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <GeospatialMap />
        <DamageTrendChart />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <RiskHotspots />
        <MaintenanceTable />
      </div>
    </div>
  )
}
