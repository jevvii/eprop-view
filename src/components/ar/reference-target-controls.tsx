'use client'

import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { createReferenceSvg, getValidReference, type ReferenceTarget } from '@/app/lib/ar/printed-reference'
import type { ARAnchor } from '@/app/types'

interface Props { inspectionId: string; anchors: ARAnchor[] }

export function ReferenceTargetControls({ inspectionId, anchors }: Props) {
  const [label, setLabel] = useState('Wall or column A')
  const [sizeMm, setSizeMm] = useState(150)
  const [created, setCreated] = useState<ReferenceTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const targets = useMemo(() => {
    const saved = anchors.flatMap((anchor) => {
      const reference = getValidReference(anchor.pose)
      return reference && reference.target.inspectionId === inspectionId ? [reference.target] : []
    })
    const current = created?.inspectionId === inspectionId ? [created] : []
    return [...new Map([...current, ...saved].map((target) => [target.id, target])).values()]
  }, [anchors, created, inspectionId])

  const download = (target: ReferenceTarget) => {
    const blob = new Blob([createReferenceSvg(target)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `epropview-reference-${target.id}.svg`
    link.click()
    // Let the browser consume the download before releasing its backing URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm" aria-label="Printed reference targets">
      <div className="flex items-center gap-2">
        <Printer className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">Printed reference targets</h3>
      </div>
      <p className="text-xs leading-relaxed text-slate-600">
        Attach a target flat to the wall or column. Keep it visible while marking points on that same flat surface.
        Markers return when you scan the same target again.
      </p>
      <form onSubmit={(event) => {
        event.preventDefault()
        if (!label.trim() || !inspectionId || !Number.isFinite(sizeMm) || sizeMm < 50 || sizeMm > 500) {
          setError('Choose an inspection, a surface name and a QR width from 50 to 500 mm.')
          return
        }
        const target = { id: crypto.randomUUID(), inspectionId, label: label.trim(), sizeMm }
        setCreated(target)
        setError(null)
        download(target)
      }} className="space-y-3">
        <label className="block text-xs font-semibold text-slate-700">
          Surface or element name
          <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[44px]" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Printed QR width (mm, excluding white border)
          <input type="number" min={50} max={500} step={1} value={sizeMm} onChange={(event) => setSizeMm(Number(event.target.value))} required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[44px]" />
        </label>
        <button type="submit" disabled={!inspectionId}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <Download className="h-4 w-4" aria-hidden="true" />Create and download target
        </button>
      </form>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <p className="text-xs leading-relaxed text-slate-600">
        Print the SVG at actual size (100%). Check the QR width with a ruler and keep the white border clear.
        Reuse the original target; creating a new one gives it a different identity.
      </p>
      {targets.length > 0 && (
        <ul className="space-y-2" aria-label="Reusable references">
          {targets.map((target) => <li key={target.id} className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <div className="min-w-0 text-xs text-slate-700">
              <p className="truncate font-semibold">{target.label}</p>
              <p>{target.sizeMm} mm · {target.id.slice(0, 8)}</p>
            </div>
            <button type="button" onClick={() => download(target)} aria-label={`Download reference ${target.label}`}
              className="min-h-[44px] shrink-0 px-3 text-xs font-semibold text-primary">Download again</button>
          </li>)}
        </ul>
      )}
    </section>
  )
}
