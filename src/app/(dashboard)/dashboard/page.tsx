import { StatsCards } from '@/components/dashboard/stats-cards'
import { DamageTrendChart } from '@/components/dashboard/damage-trend-chart'
import { GeospatialMap } from '@/components/dashboard/geospatial-map'
import { MaintenanceTable } from '@/components/dashboard/maintenance-table'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <StatsCards />
      <div className="grid grid-cols-2 gap-6">
        <GeospatialMap />
        <DamageTrendChart />
      </div>
      <MaintenanceTable />
    </div>
  )
}
