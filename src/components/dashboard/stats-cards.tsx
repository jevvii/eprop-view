'use client'

import { useDashboardStats } from '@/app/lib/queries'

export function StatsCards() {
  const { data: stats, isLoading } = useDashboardStats()

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-5 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-lg animate-pulse h-28" />
        ))}
      </div>
    )
  }

  const cards = [
    { label: 'ACTIVE PROJECTS', value: stats?.active_projects ?? 0, variant: 'default' },
    { label: 'CRITICAL RISK REPORTS', value: stats?.critical_risk_reports ?? 0, variant: 'critical' },
    { label: 'REPORTS IN REVIEW', value: stats?.reports_in_review ?? 0, variant: 'info' },
    { label: 'COMPLETED REPAIRS', value: stats?.completed_repairs ?? 0, variant: 'success' },
  ]

  return (
    <div className="grid grid-cols-4 gap-5 mb-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`bg-white p-6 rounded-2xl shadow-lg ${
            card.variant === 'critical' ? 'bg-red-50' :
            card.variant === 'info' ? 'bg-blue-50' :
            card.variant === 'success' ? 'bg-green-50' : ''
          }`}
        >
          <div className="text-xs font-bold text-slate-500 mb-3 tracking-wide">{card.label}</div>
          <div className={`text-4xl font-extrabold ${
            card.variant === 'critical' ? 'text-red-600' : 'text-slate-900'
          }`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  )
}
