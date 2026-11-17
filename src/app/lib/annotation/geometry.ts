import type { BoundingBox, Point } from '@/app/types'

/**
 * Polygon geometry for annotation.
 *
 * Coordinates are normalised 0..1 so a shape survives display scaling and the
 * storage re-encode. Everything here refuses rather than repairs: a polygon the
 * annotator cannot have meant should never become a training mask.
 */

function isFinitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function onSegment(a: Point, b: Point, p: Point): boolean {
  return (
    Math.min(a.x, b.x) <= p.x &&
    p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y &&
    p.y <= Math.max(a.y, b.y)
  )
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y)
  const d2 = cross(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y)
  const d3 = cross(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y)
  const d4 = cross(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  // Collinear touching counts as an intersection for annotation purposes.
  return (
    (d1 === 0 && onSegment(b1, b2, a1)) ||
    (d2 === 0 && onSegment(b1, b2, a2)) ||
    (d3 === 0 && onSegment(a1, a2, b1)) ||
    (d4 === 0 && onSegment(a1, a2, b2))
  )
}

export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

export function validatePolygon(points: Point[]): { ok: true } | { ok: false; reason: string } {
  if (!Array.isArray(points) || points.length < 3) {
    return { ok: false, reason: 'A polygon needs at least three points' }
  }

  if (points.some((point) => !isFinitePoint(point) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
    return { ok: false, reason: 'Every point must lie inside the image' }
  }

  if (polygonArea(points) <= 1e-6) {
    return { ok: false, reason: 'The polygon encloses no area' }
  }

  const count = points.length
  for (let i = 0; i < count; i++) {
    const a1 = points[i]
    const a2 = points[(i + 1) % count]
    for (let j = i + 1; j < count; j++) {
      // Skip adjacent edges, which share a vertex by construction.
      if (j === i || j === (i + 1) % count || (j + 1) % count === i) continue
      const b1 = points[j]
      const b2 = points[(j + 1) % count]
      if (segmentsIntersect(a1, a2, b1, b2)) {
        return { ok: false, reason: 'The polygon crosses itself' }
      }
    }
  }

  return { ok: true }
}

export function toSvgPath(points: Point[], width: number, height: number): string {
  const commands = points.map((point, index) => {
    const x = Math.round(point.x * width)
    const y = Math.round(point.y * height)
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
  })
  return `${commands.join(' ')} Z`
}

export function toSvgRect(bbox: BoundingBox, width: number, height: number): string {
  const x = Math.round(bbox.x * width)
  const y = Math.round(bbox.y * height)
  const w = Math.round(bbox.width * width)
  const h = Math.round(bbox.height * height)
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white"/>`
}

/** Straight-line distance between two normalised points, in stored-image pixels. */
export function rulerDistancePx(a: Point, b: Point, imageWidth: number, imageHeight: number): number {
  const dx = (b.x - a.x) * imageWidth
  const dy = (b.y - a.y) * imageHeight
  return Math.round(Math.hypot(dx, dy))
}
