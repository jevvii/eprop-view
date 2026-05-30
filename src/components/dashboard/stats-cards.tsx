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
    default: isFloating ? 'bg-white/90 backdrop-blur-md' : 'bg-white',
    critical: isFloating ? 'bg-red-50/90 backdrop-blur-md' : 'bg-red-50',
    info: isFloating ? 'bg-indigo-50/90 backdrop-blur-md' : 'bg-indigo-50',
    success: isFloating ? 'bg-emerald-50/90 backdrop-blur-md' : 'bg-emerald-50'
  }[variant]

  const textColor = {
    default: 'text-slate-900',
    critical: 'text-red-600',
    info: 'text-indigo-600',
    success: 'text-emerald-600'
  }[variant]

  return (
    <div className={`px-6 py-4 rounded-[1.8rem] shadow-xl border border-white/20 flex flex-col justify-between ${bgColor} ${className}`}>
      <div className="text-[0.55rem] font-black text-slate-400 mb-0.5 tracking-[0.15em] uppercase">{label}</div>
      <div className={`text-3xl font-koulen tracking-wider leading-none ${textColor}`}>
        {value}
      </div>
    </div>
  )
}

export function StatsCards() {
  const { data: stats, isLoading, isError } = useDashboardStats()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 px-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white p-8 rounded-[2rem] shadow-sm animate-pulse h-32" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-red-100 text-red-600 mb-8 font-bold mx-8">
        ERROR_FETCHING_METRICS
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 px-8">
      <StatCard label="Active Projects" value={stats?.active_projects ?? 0} />
      <StatCard label="Critical Risk" value={stats?.critical_risk_reports ?? 0} variant="critical" />
      <StatCard label="In Review" value={stats?.reports_in_review ?? 0} variant="info" />
      <StatCard label="Completed" value={stats?.completed_repairs ?? 0} variant="success" />
    </div>
  )
}
