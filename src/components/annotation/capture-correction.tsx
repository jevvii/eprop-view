'use client'

import { useState } from 'react'
import { updateImageCaptureMetadata } from '@/app/actions/annotations'
import { isActionResult } from '@/app/lib/action-result'
import type {
  CaptureMetadataInput,
  ElementType,
  InspectionImage,
  LightingCondition,
  SurfaceState,
} from '@/app/types'

/**
 * Capture-condition correction.
 *
 * A photo shot without the printed reference is not permanently barred from
 * millimetre export — whoever knows the working distance can supply the scale
 * here, and the change is audited.
 */
export function CaptureCorrection({
  image,
  onSaved,
}: {
  image: InspectionImage
  onSaved: () => void
}) {
  const [lighting, setLighting] = useState<LightingCondition>(image.lighting ?? 'unknown')
  const [surfaceState, setSurfaceState] = useState<SurfaceState>(image.surface_state ?? 'unknown')
  const [elementType, setElementType] = useState<ElementType>(image.element_type ?? 'other')
  const [gsd, setGsd] = useState<string>(image.gsd_mm_per_px ? String(image.gsd_mm_per_px) : '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const inputClass =
    'w-full rounded-lg border border-[#EAEAEA] bg-white px-3 py-2 text-sm font-medium text-[#111] outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]'

  const save = async () => {
    setSaving(true)
    setMessage(null)
    const parsed = gsd === '' ? null : Number(gsd)
    const capture: CaptureMetadataInput = {
      lighting,
      surfaceState,
      elementType,
      gsdMmPerPx: parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null,
      scaleSource: parsed !== null && Number.isFinite(parsed) && parsed > 0 ? 'manual_gsd' : 'unknown',
    }
    const result = await updateImageCaptureMetadata({ imageId: image.id, capture })
    setSaving(false)
    if (!isActionResult(result) || !result.ok) {
      setMessage(isActionResult(result) && !result.ok ? result.error : 'Capture conditions could not be saved.')
      return
    }
    setMessage('Capture conditions saved.')
    onSaved()
  }

  return (
    <section className="space-y-2 rounded-lg border border-[#EAEAEA] p-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Capture conditions</h3>

      <select
        aria-label="Lighting"
        className={inputClass}
        value={lighting}
        onChange={(event) => setLighting(event.target.value as LightingCondition)}
      >
        {['direct_sun', 'diffuse', 'flash', 'low_light', 'unknown'].map((value) => (
          <option key={value} value={value}>{value.replace('_', ' ')}</option>
        ))}
      </select>

      <select
        aria-label="Surface"
        className={inputClass}
        value={surfaceState}
        onChange={(event) => setSurfaceState(event.target.value as SurfaceState)}
      >
        {['dry', 'wet', 'efflorescence', 'debris', 'unknown'].map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>

      <select
        aria-label="Element"
        className={inputClass}
        value={elementType}
        onChange={(event) => setElementType(event.target.value as ElementType)}
      >
        {['deck', 'wall', 'column', 'beam', 'slab', 'pavement', 'foundation', 'other'].map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>

      <div>
        <label className="mb-1 block text-[11px] font-bold text-slate-500" htmlFor="capture-gsd">
          Scale (mm/px)
        </label>
        <input
          id="capture-gsd"
          type="number"
          step="0.001"
          min={0}
          className={inputClass}
          value={gsd}
          placeholder="Unknown"
          onChange={(event) => setGsd(event.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="min-h-[44px] w-full rounded-lg border border-[#EAEAEA] text-xs font-bold text-slate-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save conditions'}
      </button>

      {message && <p className="text-[11px] font-semibold text-slate-600">{message}</p>}
    </section>
  )
}
