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
    critical: isFloating ? 'bg-red-50/95 backdrop-blur-md' : 'bg-red-50',
    info: isFloating ? 'bg-indigo-50/95 backdrop-blur-md' : 'bg-indigo-50',
    success: isFloating ? 'bg-emerald-50/95 backdrop-blur-md' : 'bg-emerald-50'
  }[variant]

  const textColor = {
    default: 'text-slate-900',
    critical: 'text-red-600',
    info: 'text-indigo-600',
    success: 'text-emerald-600'
  }[variant]

  return (
    <div className={`px-4 py-3.5 sm:px-5 sm:py-4 rounded-2xl shadow-md sm:shadow-lg border border-white/40 flex flex-col justify-between min-w-0 ${bgColor} ${className}`}>
      <div className="text-xs font-bold text-slate-600 mb-1 tracking-wider uppercase truncate" title={label}>{label}</div>
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
