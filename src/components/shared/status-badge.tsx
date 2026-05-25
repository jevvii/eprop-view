import { cn } from '@/lib/utils'

type StatusBadgeProps = {
  status?: string | null
  label?: string
  className?: string
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-emerald-100 text-emerald-700',
  on_hold: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-600',
  pending: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  requires_followup: 'bg-purple-100 text-purple-700',
  open: 'bg-sky-100 text-sky-700',
  in_review: 'bg-indigo-100 text-indigo-700',
  critical: 'bg-red-100 text-red-700',
  deferred: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
  moderate: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  fault_line: 'bg-red-100 text-red-700',
  liquefaction: 'bg-orange-100 text-orange-700',
  erosion: 'bg-amber-100 text-amber-700',
  flood: 'bg-blue-100 text-blue-700',
  general: 'bg-indigo-100 text-indigo-700',
}

function formatStatus(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const normalized = status ? status.toLowerCase() : 'unknown'
  const display = label ?? (status ? formatStatus(normalized) : 'Unknown')
  const style = statusStyles[normalized] ?? 'bg-slate-100 text-slate-600'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        style,
        className
      )}
    >
      {display}
    </span>
  )
}
