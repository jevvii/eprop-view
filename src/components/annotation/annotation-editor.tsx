'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnnotationCanvas, type AnnotationTool } from './annotation-canvas'
import { AnnotationToolbar } from './annotation-toolbar'
import { AnnotationSidebar } from './annotation-sidebar'
import { useAnnotationDraft } from './use-annotation-draft'
import { CaptureCorrection } from './capture-correction'
import { preAnnotateImage } from '@/app/actions/pre-annotate'
import { reviewAnnotation, submitImageAnnotations } from '@/app/actions/annotations'
import { isActionResult } from '@/app/lib/action-result'
import type { BoundingBox, ImageAnnotation, InspectionImage, Point, Role } from '@/app/types'

export function AnnotationEditor({
  image,
  imageUrl,
  initialAnnotations,
  role,
  nextImageId,
}: {
  image: InspectionImage
  imageUrl: string
  initialAnnotations: ImageAnnotation[]
  role: Role
  nextImageId: string | null
}) {
  const router = useRouter()
  const [tool, setTool] = useState<AnnotationTool>('select')
  const [suggesting, setSuggesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const draft = useAnnotationDraft(initialAnnotations, image.id)
  const canReview = role === 'engineer' || role === 'admin'
  const width = image.width_px ?? image.source_width_px ?? 1200
  const height = image.height_px ?? image.source_height_px ?? 900
  const scaleKnown = (image.gsd_mm_per_px ?? null) !== null

  const handleBox = useCallback(
    (bbox: BoundingBox) => {
      void draft.create({ damageType: 'crack', severity: 'medium', geometryKind: 'box', bbox })
      setTool('select')
    },
    [draft]
  )

  const handlePolygon = useCallback(
    (points: Point[]) => {
      void draft.create({ damageType: 'crack', severity: 'medium', geometryKind: 'polygon', polygon: points })
      setTool('select')
    },
    [draft]
  )

  const handleMeasure = useCallback(
    (a: Point, b: Point, distancePx: number) => {
      void a
      void b
      if (!draft.selected || draft.selected.geometry_kind === 'none') {
        setNotice('Select a finding first, then measure its width.')
        return
      }
      draft.update(draft.selected.id, { measuredWidthPx: distancePx })
      setNotice(
        scaleKnown
          ? `Measured ${distancePx} px — width derived from the capture scale.`
          : `Measured ${distancePx} px — this image has no metric scale.`
      )
      setTool('select')
    },
    [draft, scaleKnown]
  )

  const handleNoFindings = useCallback(() => {
    void draft.create({ damageType: 'none', severity: null, geometryKind: 'none' })
  }, [draft])

  const handleSuggest = useCallback(async () => {
    setSuggesting(true)
    setNotice(null)
    const result = await preAnnotateImage(image.id)
    setSuggesting(false)
    if (!isActionResult(result) || !result.ok) {
      setNotice(isActionResult(result) && !result.ok ? result.error : 'Suggestions could not be generated.')
      return
    }
    setNotice(`${result.data.created} candidate${result.data.created === 1 ? '' : 's'} added as drafts.`)
    router.refresh()
  }, [image.id, router])

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    const result = await submitImageAnnotations(image.id)
    setSubmitting(false)
    if (!isActionResult(result) || !result.ok) {
      setNotice(isActionResult(result) && !result.ok ? result.error : 'The image could not be submitted.')
      return
    }
    setNotice(`${result.data.submitted} annotation${result.data.submitted === 1 ? '' : 's'} submitted for review.`)
    router.refresh()
  }, [image.id, router])

  const handleApprove = useCallback(
    async (id: string) => {
      const result = await reviewAnnotation({ annotationId: id, decision: 'approved' })
      if (!isActionResult(result) || !result.ok) {
        setNotice(isActionResult(result) && !result.ok ? result.error : 'The review could not be saved.')
        return
      }
      router.refresh()
    },
    [router]
  )

  const handleReject = useCallback(
    async (id: string) => {
      const result = await reviewAnnotation({ annotationId: id, decision: 'rejected' })
      if (!isActionResult(result) || !result.ok) {
        setNotice(isActionResult(result) && !result.ok ? result.error : 'The review could not be saved.')
        return
      }
      router.refresh()
    },
    [router]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (event.key === '1') setTool('select')
      if (event.key === '2') setTool('box')
      if (event.key === '3') setTool('polygon')
      if (event.key === '4') setTool('ruler')
      if (event.key === 'Escape') setTool('select')
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) draft.redo()
        else draft.undo()
      }
      if (event.key === 'Delete' && draft.selectedId) {
        event.preventDefault()
        void draft.remove(draft.selectedId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [draft.undo, draft.redo, draft.remove, draft.selectedId])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
        <span className="tabular-nums">
          {width}×{height}
          {image.gsd_mm_per_px ? ` · ${image.gsd_mm_per_px.toFixed(2)} mm/px` : ' · scale unknown'}
          {image.lighting ? ` · ${image.lighting.replace('_', ' ')}` : ''}
          {image.element_type ? ` · ${image.element_type}` : ''}
        </span>
        <span>{draft.saving ? 'Saving…' : draft.error ? 'Not saved' : 'Saved'}</span>
      </div>

      {(draft.error || notice) && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-xs font-semibold ${draft.error ? 'border-red-200 bg-red-50 text-red-700' : 'border-[#EAEAEA] bg-slate-50 text-slate-700'}`}>
          {draft.error ?? notice}
        </p>
      )}

      <div className="hidden md:block">
      <AnnotationToolbar
        tool={tool}
        onTool={setTool}
        onUndo={draft.undo}
        canUndo={draft.canUndo}
        onRedo={draft.redo}
        canRedo={draft.canRedo}
        onDelete={() => draft.selectedId && draft.remove(draft.selectedId)}
        canDelete={Boolean(draft.selectedId)}
        onSuggest={handleSuggest}
        suggesting={suggesting}
      />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="hidden md:block">
          <AnnotationCanvas
            imageUrl={imageUrl}
            width={width}
            height={height}
            annotations={draft.annotations}
            selectedId={draft.selectedId}
            tool={tool}
            onBox={handleBox}
            onPolygon={handlePolygon}
            onMeasure={handleMeasure}
            onSelect={draft.setSelectedId}
          />
        </div>

        <div className="space-y-3 md:hidden">
          <p className="rounded-lg border border-[#EAEAEA] bg-white p-4 text-sm font-medium text-slate-600">
            Annotation needs a tablet or a larger screen. Findings are shown read-only here; open this
            image on a tablet to label it.
          </p>
          <ul className="divide-y divide-[#EAEAEA] rounded-lg border border-[#EAEAEA] bg-white">
            {draft.annotations.map((annotation, index) => (
              <li key={annotation.id} className="p-3 text-xs font-semibold text-slate-700">
                {index + 1}. {annotation.damage_type === 'none' ? 'No damage' : annotation.damage_type}
                {annotation.severity ? ` · ${annotation.severity}` : ''}
                <span className="ml-1 text-[10px] uppercase text-slate-400">{annotation.status}</span>
              </li>
            ))}
            {draft.annotations.length === 0 && (
              <li className="p-3 text-xs font-medium text-slate-500">No findings recorded.</li>
            )}
          </ul>
        </div>

        <div className="hidden space-y-4 md:block">
          <AnnotationSidebar
            annotations={draft.annotations}
            selected={draft.selected}
            onSelect={draft.setSelectedId}
            onUpdate={draft.update}
            onDelete={draft.remove}
            onNoFindings={handleNoFindings}
            onApprove={handleApprove}
            onReject={handleReject}
            canReview={canReview}
            scaleKnown={scaleKnown}
            gsdMmPerPx={image.gsd_mm_per_px ?? null}
          />

          <CaptureCorrection image={image} onSaved={() => router.refresh()} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || draft.annotations.length === 0}
              className="min-h-[44px] flex-1 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit image'}
            </button>
            {nextImageId && (
              <button
                type="button"
                onClick={() => router.push(`/annotate/${nextImageId}`)}
                className="min-h-[44px] rounded-lg border border-[#EAEAEA] px-4 text-xs font-bold text-slate-700"
              >
                Next image
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
