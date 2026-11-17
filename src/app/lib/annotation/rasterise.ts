import sharp from 'sharp'
import type { BoundingBox, Point } from '@/app/types'
import { toSvgPath, toSvgRect } from './geometry'

export type MaskShape =
  | { kind: 'polygon'; polygon: Point[] }
  | { kind: 'box'; bbox: BoundingBox }

/**
 * Rasterises an annotation into a per-instance PNG mask.
 *
 * White shape on black, at stored-image dimensions — the convention YOLO-seg
 * training expects. Doing this server-side means the stored mask is derived
 * from the geometry the database holds, not from a canvas the client could
 * misreport.
 */
export async function rasteriseMask(shape: MaskShape, width: number, height: number): Promise<Buffer> {
  if (width <= 0 || height <= 0) {
    throw new Error('Mask dimensions are unavailable')
  }

  let body: string
  if (shape.kind === 'polygon') {
    body = `<path d="${toSvgPath(shape.polygon, width, height)}" fill="white"/>`
  } else if (shape.kind === 'box') {
    body = toSvgRect(shape.bbox, width, height)
  } else {
    throw new Error('Unsupported geometry kind')
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="black"/>${body}</svg>`

  return sharp(Buffer.from(svg)).png().toBuffer()
}
