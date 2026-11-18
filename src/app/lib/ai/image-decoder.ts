import sharp from 'sharp'
import { calculateLetterbox, type LetterboxInfo } from './preprocessing'

/**
 * Decodes real image bytes into an RGBA pixel buffer using libvips.
 *
 * There is deliberately no synthetic fallback: an undecodable payload must
 * fail the job, never produce pixels or detections that look like inference.
 */
export interface DecodedImage {
  pixels: Uint8ClampedArray
  sourceWidth: number
  sourceHeight: number
  format: string
}

const MAX_INPUT_BYTES = 15 * 1024 * 1024
const MAX_SOURCE_PIXELS = 40_000_000

export async function decodeImage(
  input: Blob | ArrayBuffer | Uint8Array,
  targetWidth: number,
  targetHeight: number
): Promise<DecodedImage> {
  if (input instanceof Blob && input.size > MAX_INPUT_BYTES) throw new Error('Image payload exceeds 15 MB')
  const bytes =
    input instanceof Blob
      ? Buffer.from(await input.arrayBuffer())
      : input instanceof Uint8Array
        ? Buffer.from(input)
        : Buffer.from(input)

  if (bytes.byteLength === 0) {
    throw new Error('Image payload is empty')
  }
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new Error('Image payload exceeds 15 MB')
  }

  const metadata = await sharp(bytes).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('Image dimensions could not be read')
  }
  if (metadata.width * metadata.height > MAX_SOURCE_PIXELS) {
    throw new Error('Image exceeds the 40 megapixel limit')
  }

  // rotate() applies EXIF orientation. fit:'fill' is intentional: the detector
  // works in normalized image space, and the overlay maps percentages back to
  // the same image, so no letterbox inverse transform is involved.
  const { data } = await sharp(bytes)
    .rotate()
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    pixels: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
    format: metadata.format ?? 'unknown',
  }
}

export async function decodeImageToRGBA(
  input: Blob | ArrayBuffer | Uint8Array,
  targetWidth: number,
  targetHeight: number
): Promise<Uint8ClampedArray> {
  const decoded = await decodeImage(input, targetWidth, targetHeight)
  return decoded.pixels
}

export interface LetterboxedImage extends DecodedImage {
  letterbox: LetterboxInfo
}

/**
 * Decodes with aspect ratio preserved and centred padding.
 *
 * The exported detector graph normalises with mean/std 0.5, so a pad value of
 * 0 after normalisation corresponds to raw 0.5. Padding with mid-grey (128)
 * therefore matches the padding the training transform would have produced.
 */
export async function decodeImageLetterbox(
  input: Blob | ArrayBuffer | Uint8Array,
  targetWidth: number,
  targetHeight: number,
  pad = 128
): Promise<LetterboxedImage> {
  if (input instanceof Blob && input.size > MAX_INPUT_BYTES) throw new Error('Image payload exceeds 15 MB')
  const bytes =
    input instanceof Blob
      ? Buffer.from(await input.arrayBuffer())
      : input instanceof Uint8Array
        ? Buffer.from(input)
        : Buffer.from(input)
  if (bytes.byteLength === 0) throw new Error('Image payload is empty')
  if (bytes.byteLength > MAX_INPUT_BYTES) throw new Error('Image payload exceeds 15 MB')

  const metadata = await sharp(bytes).metadata()
  if (!metadata.width || !metadata.height) throw new Error('Image dimensions could not be read')
  if (metadata.width * metadata.height > MAX_SOURCE_PIXELS) throw new Error('Image exceeds the 40 megapixel limit')

  // EXIF orientation is applied before geometry is computed, so the letterbox
  // describes the pixels the model actually sees.
  const oriented = await sharp(bytes).rotate().toBuffer({ resolveWithObject: true })
  const sourceWidth = oriented.info.width
  const sourceHeight = oriented.info.height
  const letterbox = calculateLetterbox(sourceWidth, sourceHeight, targetWidth, targetHeight)

  const { data } = await sharp(oriented.data)
    .resize(targetWidth, targetHeight, {
      fit: 'contain',
      position: 'centre',
      background: { r: pad, g: pad, b: pad },
    })
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return {
    pixels: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    sourceWidth,
    sourceHeight,
    format: oriented.info.format ?? metadata.format ?? 'unknown',
    letterbox,
  }
}
