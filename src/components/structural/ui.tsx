'use client'

import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Shared primitives for the capstone v2 panels.
 *
 * Deliberately small: the existing app styles with Tailwind directly, so these
 * only remove repetition, not control. Everything renders in the established
 * white-card / slate-neutral language.
 */

export function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</h3>
          {description && (
            <p className="text-xs sm:text-sm text-slate-600 font-medium mt-1 max-w-prose">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5"
      >
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 font-medium mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  )
}

export const inputClass =
  'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all min-h-[44px]'

export const textareaClass = `${inputClass} min-h-[92px] resize-y`

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-prose mx-auto">{message}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warn: 'bg-amber-50 text-amber-800 border-amber-200',
    bad: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function InlineMessage({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const tones = {
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    info: 'bg-slate-50 text-slate-700 border-slate-200',
  }

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-xs sm:text-sm font-medium ${tones[tone]}`}>
      {children}
    </div>
  )
}

/**
 * Wrap a server action call with pending/error/success state.
 *
 * Server actions throw on validation or permission failures. Those messages are
 * written for humans, so they are surfaced verbatim rather than replaced with a
 * generic "something went wrong".
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const run = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
      setPending(true)
      setError(null)
      setSuccess(null)
      try {
        const result = await fn()
        setSuccess(label)
        return result
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'The action failed.')
        return null
      } finally {
        setPending(false)
      }
    },
    []
  )

  const reset = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  return { pending, error, success, run, reset }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
