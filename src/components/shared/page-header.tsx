import type { ReactNode } from 'react'

/**
 * Page header.
 *
 * One title scale, one description width, one rule between the header and the
 * work. Previously each surface invented its own spacing, weight and rule.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string
  description?: string
  actions?: ReactNode
  meta?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-koulen text-xl uppercase tracking-wide text-primary sm:text-2xl">
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-slate-600">{description}</p>
        )}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
