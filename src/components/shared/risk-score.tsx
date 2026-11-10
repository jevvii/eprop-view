import { cn } from '@/lib/utils'

type RiskScoreProps = {
  score?: number | null
  className?: string
}

function getRiskLevel(score: number | null) {
  if (score === null) {
    return { label: 'Unknown', style: 'bg-severity-none-soft text-severity-none' }
  }
  if (score >= 8) return { label: 'Critical', style: 'bg-severity-critical-soft text-severity-critical' }
  if (score >= 6) return { label: 'High', style: 'bg-severity-high-soft text-severity-high' }
  if (score >= 4) return { label: 'Moderate', style: 'bg-severity-moderate-soft text-severity-moderate' }
  return { label: 'Low', style: 'bg-severity-low-soft text-severity-low' }
}

export function RiskScore({ score, className }: RiskScoreProps) {
  const normalized = typeof score === 'number' ? Math.max(0, Math.min(10, score)) : null
  const level = getRiskLevel(normalized)

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span className="text-sm font-semibold text-slate-900 tabular-nums">
        {normalized === null ? '—' : normalized.toFixed(1)}
      </span>
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', level.style)}>
        {level.label}
      </span>
    </div>
  )
}
