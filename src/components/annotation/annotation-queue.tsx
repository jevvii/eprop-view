'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CaptureBadge } from './capture-badge'
import type { AnnotationQueueItem } from '@/app/actions/annotations'

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'submitted' | 'approved'

const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'approved', label: 'Approved' },
]

export function AnnotationQueue({ items }: { items: AnnotationQueueItem[] }) {
  const [status, setStatus] = useState<StatusFilter>('all')

  const visible = useMemo(() => {
    return items.filter((item) => {
      if (status === 'all') return true
      if (status === 'not_started') return item.draftCount + item.submittedCount + item.approvedCount === 0
      if (status === 'in_progress') return item.draftCount > 0
      if (status === 'submitted') return item.submittedCount > 0
      return item.approvedCount > 0
    })
  }, [items, status])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={status === option.id}
            onClick={() => setStatus(option.id)}
            className={`min-h-[44px] rounded-lg border px-3 text-xs font-bold ${
              status === option.id
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-[#EAEAEA] bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#EAEAEA] bg-white p-6 text-center text-sm font-medium text-slate-500">
          No images are eligible yet. Capture photos with lighting and element type set.
        </p>
      ) : (
        <ul className="divide-y divide-[#EAEAEA] rounded-lg border border-[#EAEAEA] bg-white">
          {visible.map(({ image, draftCount, submittedCount, approvedCount }) => {
            const total = draftCount + submittedCount + approvedCount
            return (
              <li key={image.id}>
                <Link
                  href={`/annotate/${image.id}`}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-bold text-[#111]">{image.caption || 'Inspection image'}</p>
                    <CaptureBadge image={image} />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold tabular-nums text-slate-500">
                      {approvedCount} / {total} approved
                    </span>
                    {submittedCount > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        {submittedCount} to review
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
