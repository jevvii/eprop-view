'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoundingBox, ImageAnnotation, Point } from '@/app/types'
import { rulerDistancePx } from '@/app/lib/annotation/geometry'

export type AnnotationTool = 'select' | 'box' | 'polygon' | 'ruler'

interface AnnotationCanvasProps {
  imageUrl: string
  width: number
  height: number
  annotations: ImageAnnotation[]
  selectedId: string | null
  tool: AnnotationTool
  onBox: (bbox: BoundingBox) => void
  onPolygon: (points: Point[]) => void
  onMeasure: (a: Point, b: Point, distancePx: number) => void
  onSelect: (id: string | null) => void
}

const severityStroke: Record<string, string> = {
  low: '#16a34a',
  medium: '#d97706',
  high: '#dc2626',
  critical: '#7c3aed',
}

function normalise(point: { x: number; y: number }): Point {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  }
}

export function AnnotationCanvas({
  imageUrl,
  width,
  height,
  annotations,
  selectedId,
  tool,
  onBox,
  onPolygon,
  onMeasure,
  onSelect,
}: AnnotationCanvasProps) {
  const [zoom, setZoom] = useState(1)
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null)
  const [vertices, setVertices] = useState<Point[]>([])
  const [measureStart, setMeasureStart] = useState<Point | null>(null)
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const pinchDistance = useRef<number | null>(null)

  const toNormalised = useCallback((event: React.PointerEvent | React.MouseEvent): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return normalise({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    })
  }, [])

  const closePolygon = useCallback(
    (points: Point[]) => {
      if (points.length >= 3) onPolygon(points)
      setVertices([])
    },
    [onPolygon]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (tool !== 'polygon') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (event.key === 'Enter') {
        event.preventDefault()
        closePolygon(vertices)
      }
      if (event.key === 'Backspace') {
        event.preventDefault()
        setVertices((current) => current.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool, vertices, closePolygon])

  const handlePointerDown = (event: React.PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    // Two fingers mean a pinch, never a drawing gesture.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinchDistance.current = Math.hypot(b.x - a.x, b.y - a.y)
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId)
      } catch {
        // Synthetic or already-released pointers cannot be captured.
      }
      return
    }

    if (tool === 'select') return
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Synthetic or already-released pointers cannot be captured.
    }
    const point = toNormalised(event)

    if (tool === 'box') {
      setDragStart(point)
      setDragCurrent(point)
      return
    }

    if (tool === 'polygon') {
      // Closing on the first vertex, as every polygon tool does.
      if (vertices.length >= 3) {
        const first = vertices[0]
        const distance = Math.hypot((point.x - first.x) * width, (point.y - first.y) * height)
        if (distance < 14) {
          closePolygon(vertices)
          return
        }
      }
      setVertices([...vertices, point])
      return
    }

    if (tool === 'ruler') {
      if (!measureStart) {
        setMeasureStart(point)
      } else {
        onMeasure(measureStart, point, rulerDistancePx(measureStart, point, width, height))
        setMeasureStart(null)
      }
    }
  }

  const handlePointerMove = (event: React.PointerEvent) => {
    if (pointers.current.has(event.pointerId)) {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }

    if (pointers.current.size === 2 && pinchDistance.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      const ratio = distance / pinchDistance.current
      if (Math.abs(ratio - 1) > 0.02) {
        setZoom((value) => Math.min(6, Math.max(1, value * ratio)))
        pinchDistance.current = distance
      }
      return
    }

    setHoverPoint(toNormalised(event))
    if (tool !== 'box' || !dragStart) return
    setDragCurrent(toNormalised(event))
  }

  const handlePointerUp = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinchDistance.current = null
    if (tool !== 'box' || !dragStart || !dragCurrent) return
    const bbox: BoundingBox = {
      x: Math.min(dragStart.x, dragCurrent.x),
      y: Math.min(dragStart.y, dragCurrent.y),
      width: Math.abs(dragCurrent.x - dragStart.x),
      height: Math.abs(dragCurrent.y - dragStart.y),
    }
    setDragStart(null)
    setDragCurrent(null)
    if (bbox.width < 0.01 || bbox.height < 0.01) return
    onBox(bbox)
  }

  const polygonPreview = useMemo(() => {
    if (vertices.length < 2) return ''
    return vertices.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  }, [vertices])

  const boxPreview = dragStart && dragCurrent
    ? {
        x: Math.min(dragStart.x, dragCurrent.x),
        y: Math.min(dragStart.y, dragCurrent.y),
        width: Math.abs(dragCurrent.x - dragStart.x),
        height: Math.abs(dragCurrent.y - dragStart.y),
      }
    : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label="Zoom out"
          className="h-11 w-11 rounded-lg border border-[#EAEAEA] text-sm font-bold"
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          −
        </button>
        <span className="text-xs font-bold tabular-nums text-slate-500">{zoom.toFixed(1)}×</span>
        <button
          type="button"
          aria-label="Zoom in"
          className="h-11 w-11 rounded-lg border border-[#EAEAEA] text-sm font-bold"
          onClick={() => setZoom((value) => Math.min(6, value + 0.5))}
        >
          +
        </button>
      </div>

      <div
        className="max-h-[70vh] overflow-auto rounded-lg border border-[#EAEAEA] bg-slate-50"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          setZoom((value) => Math.min(6, Math.max(1, value * (event.deltaY < 0 ? 1.1 : 0.9))))
        }}
      >
        <div style={{ width: `${zoom * 100}%` }} className="relative">
          <div
            ref={surfaceRef}
            className="relative touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              setDragStart(null)
              setDragCurrent(null)
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Inspection evidence"
              width={width}
              height={height}
              className="block h-auto w-full"
              draggable={false}
            />

            <svg
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
              aria-label="Annotation overlay"
            >
              {annotations.map((annotation) => {
                if (annotation.geometry_kind === 'polygon' && annotation.polygon) {
                  const points = annotation.polygon.map((point) => `${point.x},${point.y}`).join(' ')
                  return (
                    <polygon
                      key={annotation.id}
                      points={points}
                      fill="rgba(255,255,255,0.08)"
                      stroke={severityStroke[annotation.severity ?? 'low'] ?? '#16a34a'}
                      strokeWidth={selectedId === annotation.id ? 2 : 1}
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        onSelect(annotation.id)
                      }}
                    />
                  )
                }
                if (annotation.geometry_kind === 'box' && annotation.bbox) {
                  return (
                    <rect
                      key={annotation.id}
                      x={annotation.bbox.x}
                      y={annotation.bbox.y}
                      width={annotation.bbox.width}
                      height={annotation.bbox.height}
                      fill="rgba(255,255,255,0.08)"
                      stroke={severityStroke[annotation.severity ?? 'low'] ?? '#16a34a'}
                      strokeWidth={selectedId === annotation.id ? 2 : 1}
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={(event) => {
                        event.stopPropagation()
                        onSelect(annotation.id)
                      }}
                    />
                  )
                }
                return null
              })}

              {polygonPreview && (
                <path
                  d={polygonPreview}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {vertices.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={0.006} fill="#2563eb" />
              ))}

              {boxPreview && (
                <rect
                  x={boxPreview.x}
                  y={boxPreview.y}
                  width={boxPreview.width}
                  height={boxPreview.height}
                  fill="rgba(37,99,235,0.12)"
                  stroke="#2563eb"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {measureStart && (
                <>
                  <circle cx={measureStart.x} cy={measureStart.y} r={0.006} fill="#dc2626" />
                  {hoverPoint && (
                    <line
                      x1={measureStart.x}
                      y1={measureStart.y}
                      x2={hoverPoint.x}
                      y2={hoverPoint.y}
                      stroke="#dc2626"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="4 3"
                    />
                  )}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      {tool === 'polygon' && vertices.length > 0 && (
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span>{vertices.length} point{vertices.length === 1 ? '' : 's'}</span>
          <button type="button" className="underline" onClick={() => closePolygon(vertices)}>
            Close shape
          </button>
          <button type="button" className="underline" onClick={() => setVertices([])}>
            Cancel
          </button>
        </div>
      )}
      {tool === 'ruler' && measureStart && (
        <p className="text-xs font-semibold text-slate-600">Click the second edge of the crack to measure.</p>
      )}
    </div>
  )
}
