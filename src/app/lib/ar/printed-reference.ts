import { z } from 'zod'
import qrcode from 'qrcode-generator'
import type { ARPose } from '@/app/types'

export interface Point2D { x: number; y: number }
export interface Size2D { width: number; height: number }
export interface Quad {
  topLeft: Point2D
  topRight: Point2D
  bottomRight: Point2D
  bottomLeft: Point2D
}
export const referenceTargetSchema = z.object({
  id: z.string().uuid(),
  inspectionId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  sizeMm: z.number().finite().min(50).max(500),
}).strict()
export type ReferenceTarget = z.infer<typeof referenceTargetSchema>
export const referencePoseSchema = z.object({
  kind: z.literal('printed-reference-v1'),
  target: referenceTargetSchema,
  point: z.object({ x: z.number().finite().min(-10).max(10), y: z.number().finite().min(-10).max(10) }).strict(),
}).strict()
export interface ReferenceTrackingFrame {
  target: ReferenceTarget
  corners: Quad
  homography: number[]
  imageWidth: number
  imageHeight: number
  observedAt: number
}

export function getValidReference(pose: ARPose) {
  const parsed = referencePoseSchema.safeParse(pose.reference)
  return parsed.success ? parsed.data : null
}

export function encodeReferenceTarget(input: ReferenceTarget): string {
  const target = referenceTargetSchema.parse(input)
  // ASCII escaping preserves Unicode labels with the generator's byte encoder.
  return JSON.stringify(['EPROPVIEW-AR', 1, target.id, target.inspectionId, target.label, target.sizeMm])
    .replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

export function decodeReferenceTarget(payload: string, inspectionId: string): ReferenceTarget | null {
  if (payload.length > 1024) return null
  try {
    const value: unknown = JSON.parse(payload)
    if (!Array.isArray(value) || value.length !== 6 || value[0] !== 'EPROPVIEW-AR' || value[1] !== 1) return null
    const result = referenceTargetSchema.safeParse({ id: value[2], inspectionId: value[3], label: value[4], sizeMm: value[5] })
    return result.success && result.data.inspectionId === inspectionId ? result.data : null
  } catch {
    return null
  }
}

export function createReferenceSvg(target: ReferenceTarget): string {
  const code = qrcode(0, 'M')
  code.addData(encodeReferenceTarget(target))
  code.make()
  const count = code.getModuleCount()
  const outer = count + 8 // four-module quiet zone on every side
  const physicalSize = target.sizeMm * outer / count
  const paths: string[] = []
  for (let y = 0; y < count; y++) {
    for (let x = 0; x < count; x++) {
      if (code.isDark(y, x)) paths.push(`M${x + 4} ${y + 4}h1v1h-1z`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${physicalSize}mm" height="${physicalSize}mm" viewBox="0 0 ${outer} ${outer}" shape-rendering="crispEdges"><rect width="${outer}" height="${outer}" fill="white"/><path d="${paths.join('')}" fill="black"/></svg>`
}

/** Unit square to observed QR corners; rejects collapsed or self-crossing quads. */
export function getReferenceHomography(quad: Quad): number[] | null {
  const p = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
  if (p.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  const cross = p.map((point, i) => {
    const b = p[(i + 1) % 4], c = p[(i + 2) % 4]
    return (b.x - point.x) * (c.y - b.y) - (b.y - point.y) * (c.x - b.x)
  })
  if (cross.some((value) => Math.abs(value) < 1e-8 || Math.sign(value) !== Math.sign(cross[0]))) return null
  const [a, b, c, d] = p
  const sx = a.x - b.x + c.x - d.x, sy = a.y - b.y + c.y - d.y
  let g = 0, h = 0
  if (Math.abs(sx) + Math.abs(sy) > 1e-8) {
    const dx1 = b.x - c.x, dx2 = d.x - c.x, dy1 = b.y - c.y, dy2 = d.y - c.y
    const denominator = dx1 * dy2 - dx2 * dy1
    if (Math.abs(denominator) < 1e-8) return null
    g = (sx * dy2 - dx2 * sy) / denominator
    h = (dx1 * sy - sx * dy1) / denominator
  }
  return [b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x,
    b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h, 1]
}

export function invertHomography(m: readonly number[]): number[] | null {
  if (m.length !== 9 || m.some((n) => !Number.isFinite(n))) return null
  const [a, b, c, d, e, f, g, h, i] = m
  const cofactor = [e * i - f * h, c * h - b * i, b * f - c * e,
    f * g - d * i, a * i - c * g, c * d - a * f,
    d * h - e * g, b * g - a * h, a * e - b * d]
  const determinant = a * cofactor[0] + b * cofactor[3] + c * cofactor[6]
  return Math.abs(determinant) < 1e-10 ? null : cofactor.map((n) => n / determinant)
}

export function transformPoint(h: readonly number[], point: Point2D): Point2D | null {
  if (h.length !== 9) return null
  const denominator = h[6] * point.x + h[7] * point.y + h[8]
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-8) return null
  const x = (h[0] * point.x + h[1] * point.y + h[2]) / denominator
  const y = (h[3] * point.x + h[4] * point.y + h[5]) / denominator
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

export function videoToViewport(point: Point2D, image: Size2D, viewport: Size2D): Point2D {
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height)
  return { x: point.x * scale + (viewport.width - image.width * scale) / 2,
    y: point.y * scale + (viewport.height - image.height * scale) / 2 }
}

export function viewportToVideo(point: Point2D, image: Size2D, viewport: Size2D): Point2D {
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height)
  return { x: (point.x - (viewport.width - image.width * scale) / 2) / scale,
    y: (point.y - (viewport.height - image.height * scale) / 2) / scale }
}

export function getReferencePose(aim: Point2D, frame: ReferenceTrackingFrame, viewport: Size2D): ARPose | null {
  if (viewport.width <= 0 || viewport.height <= 0 || frame.imageWidth <= 0 || frame.imageHeight <= 0) return null
  const inverse = invertHomography(frame.homography)
  if (!inverse) return null
  const pixel = viewportToVideo({ x: aim.x * viewport.width, y: aim.y * viewport.height },
    { width: frame.imageWidth, height: frame.imageHeight }, viewport)
  const point = transformPoint(inverse, pixel)
  const parsed = referencePoseSchema.safeParse({ kind: 'printed-reference-v1', target: frame.target, point })
  if (!parsed.success) return null
  const unit = frame.target.sizeMm / 1000
  return { position: { x: parsed.data.point.x * unit, y: -parsed.data.point.y * unit, z: 0 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 }, reference: parsed.data }
}

export function projectReferenceMarker(pose: ARPose, frame: ReferenceTrackingFrame, viewport: Size2D): Point2D | null {
  const reference = getValidReference(pose)
  if (!reference || reference.kind !== 'printed-reference-v1' || reference.target.id !== frame.target.id ||
    reference.target.inspectionId !== frame.target.inspectionId || reference.target.sizeMm !== frame.target.sizeMm) return null
  const pixel = transformPoint(frame.homography, reference.point)
  if (!pixel) return null
  const point = videoToViewport(pixel, { width: frame.imageWidth, height: frame.imageHeight }, viewport)
  if (point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height) return null
  return point
}
