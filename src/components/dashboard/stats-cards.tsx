'use client'

import { useDashboardStats } from '@/app/lib/queries'

interface StatCardProps {
  label: string
  value: number | string
  variant?: 'default' | 'critical' | 'info' | 'success'
  className?: string
  isFloating?: boolean
}

export function StatCard({ label, value, variant = 'default', className = '', isFloating = false }: StatCardProps) {
  const bgColor = {
    default: isFloating ? 'bg-white/95 backdrop-blur-md' : 'bg-white',
    critical: isFloating ? 'bg-severity-critical-soft/95 backdrop-blur-md' : 'bg-severity-critical-soft',
    info: isFloating ? 'bg-primary/5 backdrop-blur-md' : 'bg-primary/5',
    success: isFloating ? 'bg-severity-low-soft/95 backdrop-blur-md' : 'bg-severity-low-soft',
  }[variant]

  const textColor = {
    default: 'text-slate-900',
    critical: 'text-severity-critical',
    info: 'text-primary',
    success: 'text-severity-low',
  }[variant]

  return (
    <div className={`px-4 py-3.5 sm:px-5 sm:py-4 rounded-2xl shadow-sm border border-slate-200/70 flex flex-col justify-between min-w-0 ${bgColor} ${className}`}>
      <div className="text-xs font-semibold text-slate-600 mb-1 tracking-wide uppercase truncate" title={label}>{label}</div>
      <div className={`text-2xl sm:text-3xl font-koulen tracking-wider leading-none tabular-nums ${textColor}`}>
        {value}
      </div>
    </div>
  )
}

export function StatsCards() {
  const { data: stats, isLoading, isError } = useDashboardStats()

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8 px-4 sm:px-6 lg:px-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white p-5 sm:p-6 rounded-2xl shadow-xs animate-pulse h-24 sm:h-28" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-xs border border-red-100 text-red-600 mb-6 sm:mb-8 font-bold mx-4 sm:mx-6 lg:mx-8 text-xs sm:text-sm">
        Error loading telemetry metrics
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8 px-4 sm:px-6 lg:px-8">
      <StatCard label="Active Projects" value={stats?.active_projects ?? 0} />
      <StatCard label="Critical Risk" value={stats?.critical_risk_reports ?? 0} variant="critical" />
      <StatCard label="In Review" value={stats?.reports_in_review ?? 0} variant="info" />
      <StatCard label="Completed" value={stats?.completed_repairs ?? 0} variant="success" />
    </div>
  )
}
