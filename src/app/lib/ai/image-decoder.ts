import sharp from 'sharp'

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
