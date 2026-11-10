import { cn } from '@/lib/utils'

type StatusBadgeProps = {
  status?: string | null
  label?: string
  className?: string
}

const statusStyles: Record<string, string> = {
  active: 'bg-severity-low-soft text-severity-low',
  completed: 'bg-severity-low-soft text-severity-low',
  on_hold: 'bg-severity-moderate-soft text-severity-moderate',
  cancelled: 'bg-severity-none-soft text-severity-none',
  pending: 'bg-severity-moderate-soft text-severity-moderate',
  in_progress: 'bg-primary/10 text-primary',
  requires_followup: 'bg-severity-high-soft text-severity-high',
  open: 'bg-primary/10 text-primary',
  in_review: 'bg-primary/10 text-primary',
  critical: 'bg-severity-critical-soft text-severity-critical',
  deferred: 'bg-severity-moderate-soft text-severity-moderate',
  low: 'bg-severity-low-soft text-severity-low',
  moderate: 'bg-severity-moderate-soft text-severity-moderate',
  high: 'bg-severity-high-soft text-severity-high',
  fault_line: 'bg-severity-critical-soft text-severity-critical',
  liquefaction: 'bg-severity-high-soft text-severity-high',
  erosion: 'bg-severity-moderate-soft text-severity-moderate',
  flood: 'bg-primary/10 text-primary',
  general: 'bg-slate-100 text-slate-700',
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
