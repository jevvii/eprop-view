import type { HTMLAttributes } from 'react'

/**
 * Loading primitives.
 *
 * Every skeleton must reserve the same box the real content occupies, or the
 * page jumps when data lands. These compose into page-shaped placeholders rather
 * than one generic bar, and they honour reduced-motion preferences.
 */

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none ${className}`}
      {...props}
    />
  )
}

export function SkeletonText({
  lines = 3,
  className = '',
}: {
  lines?: number
  className?: string
}) {
  return (
    <div aria-hidden="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-3 ${index === lines - 1 ? 'w-2/3' : index === 0 ? 'w-full' : 'w-5/6'}`}
        />
      ))}
    </div>
  )
}

export function SkeletonPageHeader({ actions = true }: { actions?: boolean }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-3 w-72" />
      </div>
      {actions && (
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      )}
    </div>
  )
}

export function SkeletonStatRow({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-slate-200 bg-white p-4">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-3 h-7 w-12" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({
  rows = 6,
  columns = 4,
  className = '',
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-lg border border-slate-200 bg-white ${className}`}
    >
      <div className="flex gap-4 border-b border-slate-100 px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-2.5 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                className={`h-3 flex-1 ${colIndex === 0 ? 'max-w-[40%]' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className="rounded-lg border border-slate-200 bg-white p-4">
      <Skeleton className="h-3 w-24" />
      <div className="mt-3">
        <SkeletonText lines={lines} />
      </div>
    </div>
  )
}

export function SkeletonChart({ className = 'h-64' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}
    >
      <Skeleton className="h-3 w-32" />
      <div className="mt-4 flex h-[calc(100%-2rem)] items-end gap-2">
        {[40, 65, 50, 80, 60, 72, 55].map((height, index) => (
          <Skeleton key={index} className="flex-1" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  )
}

export function SkeletonMap({ className = 'h-[340px]' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${className}`}
    >
      <div className="absolute inset-0 animate-pulse bg-[linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(0deg,rgba(148,163,184,0.12)_1px,transparent_1px)] bg-[size:32px_32px] motion-reduce:animate-none" />
      <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300" />
    </div>
  )
}
