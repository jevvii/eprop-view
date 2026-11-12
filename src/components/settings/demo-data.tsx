'use client'

import { useEffect, useState } from 'react'
import { getSeedAvailability, seedPreviewData, type SeedAvailability } from '@/app/actions/seed'
import type { SeedResult } from '@/app/lib/seed/demo'
import { Chip, EmptyState, InlineMessage, Panel, useAsyncAction } from '@/components/structural/ui'

/**
 * Demo data control.
 *
 * Visible to admins, but the action behind it refuses outside a Preview
 * deployment (or an explicit local override), so the guard does not depend on
 * this component being hidden.
 */
export function DemoDataPanel() {
  const [availability, setAvailability] = useState<SeedAvailability | null>(null)
  const [result, setResult] = useState<SeedResult | null>(null)
  const { pending, error, run } = useAsyncAction()

  useEffect(() => {
    let cancelled = false
    getSeedAvailability()
      .then((value) => {
        if (!cancelled) setAvailability(value)
      })
      .catch(() => {
        if (!cancelled) setAvailability(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSeed = async () => {
    const seeded = await run('Demo data written.', () => seedPreviewData())
    if (seeded) setResult(seeded)
  }

  return (
    <Panel
      title="Demo Data"
      description="Populates the preview database with one site, three inspections, imagery, detections, field tests, checklists and a signed report."
    >
      {availability == null && <p className="text-xs text-slate-500 font-medium">Checking availability…</p>}

      {availability && (
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={availability.allowed ? 'good' : 'neutral'}>
            {availability.allowed ? 'available' : 'blocked'}
          </Chip>
          <span className="text-xs text-slate-600 font-medium">{availability.reason}</span>
        </div>
      )}

      {availability?.allowed && (
        <button
          type="button"
          onClick={handleSeed}
          disabled={pending}
          className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
        >
          {pending ? 'Writing demo data…' : 'Seed demo data'}
        </button>
      )}

      {error && <InlineMessage tone="error">{error}</InlineMessage>}

      {result && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {result.seeded ? 'Seeded' : 'Nothing written'}
          </p>
          {result.reason && <p className="text-xs text-slate-700 font-medium">{result.reason}</p>}
          {result.seeded && (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {Object.entries(result.counts).map(([key, value]) => (
                <li key={key} className="text-[11px] text-slate-700 font-medium">
                  {key}: <strong>{value}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {availability && !availability.allowed && (
        <EmptyState
          title="Preview only"
          message="Demo seeding writes with the service-role client, so it is disabled on production. Deploy the branch as a Preview and run it there."
        />
      )}
    </Panel>
  )
}
