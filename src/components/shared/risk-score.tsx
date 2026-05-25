import { cn } from '@/lib/utils'

type RiskScoreProps = {
  score?: number | null
  className?: string
}

function getRiskLevel(score: number | null) {
  if (score === null) {
    return { label: 'Unknown', style: 'bg-slate-100 text-slate-600' }
  }
  if (score > 8) return { label: 'Critical', style: 'bg-red-100 text-red-700' }
  if (score > 6) return { label: 'High', style: 'bg-orange-100 text-orange-700' }
  if (score >= 4) return { label: 'Moderate', style: 'bg-amber-100 text-amber-700' }
  return { label: 'Low', style: 'bg-emerald-100 text-emerald-700' }
}

export function RiskScore({ score, className }: RiskScoreProps) {
  const normalized = typeof score === 'number' ? Math.max(0, Math.min(10, score)) : null
  const level = getRiskLevel(normalized)

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-sm font-semibold text-slate-900">
        {normalized === null ? '—' : normalized.toFixed(1)}
      </span>
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', level.style)}>
        {level.label}
      </span>
    </div>
  )
}
