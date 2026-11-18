'use client'

import { useEffect, useState } from 'react'
import type { CaptureMetadataInput } from '@/app/types'

/**
 * Capture conditions for a batch of photos.
 *
 * Inspectors shoot in bursts under one set of conditions, so the last choice is
 * remembered for the session. Every field is optional: a photo with unknown
 * conditions is still evidence, it just cannot contribute millimetre widths.
 */

const STORAGE_KEY = 'epropview:capture-defaults'

export const DEFAULT_CAPTURE: CaptureMetadataInput = {
  lighting: 'diffuse',
  surfaceState: 'dry',
  elementType: 'wall',
  distanceMm: null,
  gsdMmPerPx: null,
  scaleSource: 'unknown',
}

const LIGHTING = [
  ['direct_sun', 'Direct sun'],
  ['diffuse', 'Overcast / diffuse'],
  ['flash', 'Flash'],
  ['low_light', 'Low light'],
  ['unknown', 'Unknown'],
] as const

const SURFACE = [
  ['dry', 'Dry'],
  ['wet', 'Wet'],
  ['efflorescence', 'Efflorescence'],
  ['debris', 'Debris / dirt'],
  ['unknown', 'Unknown'],
] as const

const ELEMENT = [
  ['deck', 'Deck'],
  ['wall', 'Wall'],
  ['column', 'Column'],
  ['beam', 'Beam'],
  ['slab', 'Slab'],
  ['pavement', 'Pavement'],
  ['foundation', 'Foundation'],
  ['other', 'Other'],
] as const

const selectClass =
  'w-full rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-sm font-medium text-[#111] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 min-h-[44px]'

const labelClass = 'block text-[11px] font-bold text-slate-500 mb-1.5'

export function CaptureFields({
  value,
  onChange,
}: {
  value: CaptureMetadataInput
  onChange: (next: CaptureMetadataInput) => void
}) {
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          onChange({ ...value, ...(parsed as Partial<CaptureMetadataInput>) })
        }
      }
    } catch {
      // A blocked or full sessionStorage changes nothing about the upload.
    } finally {
      setRestored(true)
    }
    // Restore once; later edits flow through onChange.
  }, [])

  const update = (patch: Partial<CaptureMetadataInput>) => {
    const next = { ...value, ...patch }
    onChange(next)
    if (!restored) return
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lighting: next.lighting,
          surfaceState: next.surfaceState,
          elementType: next.elementType,
        })
      )
    } catch {
      // Non-fatal: the choice just will not be remembered.
    }
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-[11px] font-bold text-slate-500">
        Capture conditions
        <span className="ml-1 font-medium text-slate-400">(used for training data)</span>
      </legend>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="capture-lighting">Lighting</label>
          <select
            id="capture-lighting"
            className={selectClass}
            value={value.lighting}
            onChange={(event) => update({ lighting: event.target.value as CaptureMetadataInput['lighting'] })}
          >
            {LIGHTING.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="capture-surface">Surface</label>
          <select
            id="capture-surface"
            className={selectClass}
            value={value.surfaceState}
            onChange={(event) => update({ surfaceState: event.target.value as CaptureMetadataInput['surfaceState'] })}
          >
            {SURFACE.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="capture-element">Element</label>
          <select
            id="capture-element"
            className={selectClass}
            value={value.elementType}
            onChange={(event) => update({ elementType: event.target.value as CaptureMetadataInput['elementType'] })}
          >
            {ELEMENT.map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="capture-distance">Distance (mm)</label>
          <input
            id="capture-distance"
            type="number"
            inputMode="numeric"
            min={1}
            max={100000}
            placeholder="Optional"
            className={selectClass}
            value={value.distanceMm ?? ''}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              update({ distanceMm: event.target.value === '' || Number.isNaN(parsed) ? null : parsed })
            }}
          />
        </div>
      </div>

      <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
        Without a printed reference or a known scale, crack widths stay in pixels and the image
        cannot export millimetre measurements.
      </p>
    </fieldset>
  )
}
