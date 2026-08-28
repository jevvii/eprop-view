import type { SeverityLevel } from '@/app/types'

const severityStyles: Record<SeverityLevel, string> = {
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-red-100 text-red-700 border-red-200',
  critical: 'bg-purple-100 text-purple-700 border-purple-200',
}

interface SeverityBadgeProps {
  severity: SeverityLevel
  className?: string
}

export function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${severityStyles[severity]} ${className}`}
    >
      {severity}
    </span>
  )
}
