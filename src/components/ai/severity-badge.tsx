import type { SeverityLevel } from '@/app/types'

/**
 * Single severity vocabulary. These tokens are defined once in globals.css so
 * a critical detection is the same colour in the vault, the dashboard and the
 * printed report.
 */
const severityStyles: Record<SeverityLevel, string> = {
  low: 'bg-severity-low-soft text-severity-low border-severity-low/30',
  medium: 'bg-severity-moderate-soft text-severity-moderate border-severity-moderate/30',
  high: 'bg-severity-high-soft text-severity-high border-severity-high/30',
  critical: 'bg-severity-critical-soft text-severity-critical border-severity-critical/30',
}

const severityLabels: Record<SeverityLevel, string> = {
  low: 'Low',
  medium: 'Moderate',
  high: 'High',
  critical: 'Critical',
}

interface SeverityBadgeProps {
  severity: SeverityLevel
  className?: string
}

export function SeverityBadge({ severity, className = '' }: SeverityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${severityStyles[severity]} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {severityLabels[severity]}
    </span>
  )
}
