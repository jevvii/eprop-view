'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createAnnotation,
  deleteAnnotation,
  updateAnnotation,
} from '@/app/actions/annotations'
import { isActionResult } from '@/app/lib/action-result'
import type {
  BoundingBox,
  DamageType,
  GeometryKind,
  ImageAnnotation,
  Point,
  SeverityLevel,
} from '@/app/types'

/**
 * Local annotation state with optimistic edits and debounced autosave.
 *
 * Autosave is per annotation so one refused edit cannot discard the rest of the
 * work. Undo is a bounded snapshot stack — it does not need to survive a reload.
 */

const AUTOSAVE_MS = 800
const HISTORY_LIMIT = 50

export interface AnnotationDraftInput {
  damageType: DamageType
  severity: SeverityLevel | null
  geometryKind: GeometryKind
  polygon?: Point[] | null
  bbox?: BoundingBox | null
  measuredWidthPx?: number | null
  crackWidthMm?: number | null
}

export function useAnnotationDraft(initial: ImageAnnotation[], imageId: string) {
  const [annotations, setAnnotations] = useState<ImageAnnotation[]>(initial)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const history = useRef<ImageAnnotation[][]>([])
  const future = useRef<ImageAnnotation[][]>([])
  type Edit = Partial<AnnotationDraftInput> & { notes?: string }
  const pending = useRef(new Map<string, Edit>())
  const writing = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // router.refresh() hands us a new array from the server; without this the
  // mounted editor would keep showing stale statuses after submit or approve.
  useEffect(() => {
    setAnnotations(initial)
  }, [initial])

  const snapshot = useCallback((next: ImageAnnotation[]) => {
    history.current.push(annotations)
    if (history.current.length > HISTORY_LIMIT) history.current.shift()
    future.current = []
    setAnnotations(next)
  }, [annotations])

  const create = useCallback(
    async (input: AnnotationDraftInput): Promise<ImageAnnotation | null> => {
      setError(null)
      const result = await createAnnotation({ imageId, ...input })
      if (!isActionResult(result) || !result.ok) {
        setError(isActionResult(result) && !result.ok ? result.error : 'The annotation could not be saved.')
        return null
      }
      const created = result.data as ImageAnnotation
      snapshot([...annotations, created])
      setSelectedId(created.id)
      return created
    },
    [annotations, imageId, snapshot]
  )

  const savePending = useCallback(async (id: string) => {
    if (writing.current.has(id)) return
    writing.current.add(id)
    let unsaved: Edit | undefined
    try {
      // Serialize edits to each row and merge changes made within one debounce.
      while (pending.current.has(id)) {
        unsaved = pending.current.get(id)!
        pending.current.delete(id)
        const result = await updateAnnotation({ annotationId: id, ...unsaved })
        if (!result.ok) throw new Error(result.error)
        unsaved = undefined
        if (!pending.current.has(id)) {
          setAnnotations(rows => rows.map(row => row.id === id ? result.data : row))
        }
      }
    } catch (error) {
      if (unsaved) pending.current.set(id, { ...unsaved, ...pending.current.get(id) })
      setError(error instanceof Error ? error.message : 'The edit could not be saved.')
    } finally {
      writing.current.delete(id)
      setSaving(writing.current.size > 0 || timers.current.size > 0)
    }
  }, [])

  const update = useCallback(
    (id: string, patch: Partial<AnnotationDraftInput> & { notes?: string }) => {
      const current = annotations.find((annotation) => annotation.id === id)
      if (!current) return

      const optimistic: ImageAnnotation = {
        ...current,
        ...(patch.damageType !== undefined ? { damage_type: patch.damageType } : {}),
        ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
        ...(patch.polygon !== undefined ? { polygon: patch.polygon } : {}),
        ...(patch.bbox !== undefined ? { bbox: patch.bbox } : {}),
        ...(patch.measuredWidthPx !== undefined ? { measured_width_px: patch.measuredWidthPx } : {}),
        ...(patch.crackWidthMm !== undefined ? { crack_width_mm: patch.crackWidthMm } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      }

      snapshot(annotations.map((annotation) => (annotation.id === id ? optimistic : annotation)))

      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing)

      pending.current.set(id, { ...pending.current.get(id), ...patch })
      setError(null)
      setSaving(true)
      timers.current.set(id, setTimeout(() => {
        timers.current.delete(id)
        void savePending(id)
      }, AUTOSAVE_MS))
    },
    [annotations, snapshot, savePending]
  )

  const remove = useCallback(
    async (id: string) => {
      setError(null)
      const previous = annotations
      snapshot(annotations.filter((annotation) => annotation.id !== id))
      const result = await deleteAnnotation(id)
      if (!isActionResult(result) || !result.ok) {
        setError(isActionResult(result) && !result.ok ? result.error : 'The annotation could not be deleted.')
        setAnnotations(previous)
      }
    },
    [annotations, snapshot]
  )

  const undo = useCallback(() => {
    const previous = history.current.pop()
    if (!previous) return
    future.current.push(annotations)
    setAnnotations(previous)
  }, [annotations])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    history.current.push(annotations)
    setAnnotations(next)
  }, [annotations])

  const replaceAll = useCallback((next: ImageAnnotation[]) => {
    setAnnotations(next)
  }, [])

  const selected = annotations.find((annotation) => annotation.id === selectedId) ?? null

  return {
    annotations,
    selected,
    selectedId,
    setSelectedId,
    error,
    saving,
    create,
    update,
    remove,
    undo,
    redo,
    replaceAll,
    canUndo: history.current.length > 0,
    canRedo: future.current.length > 0,
  }
}
