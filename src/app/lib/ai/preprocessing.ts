/**
 * Preprocessing and image transformation pipeline for Computer Vision models.
 * Handles aspect ratio preserving letterbox resizing, normalization,
 * contrast enhancement for structural defect detection, and coordinate mapping.
 */

export interface PreprocessingConfig {
  inputWidth: number
  inputHeight: number
  mean?: [number, number, number]
  std?: [number, number, number]
  applyContrastEnhancement?: boolean
  normalizeToFloat?: boolean
}

export interface LetterboxInfo {
  originalWidth: number
  originalHeight: number
  targetWidth: number
  targetHeight: number
  scale: number
  padX: number
  padY: number
}

export const DEFAULT_PREPROCESSING: PreprocessingConfig = {
  inputWidth: 640,
  inputHeight: 640,
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225],
  applyContrastEnhancement: true,
  normalizeToFloat: true,
}

/**
 * Calculates letterbox padding geometry to fit an image into target dimensions
 * while preserving aspect ratio.
 */
export function calculateLetterbox(
  originalWidth: number,
  originalHeight: number,
  targetWidth: number,
  targetHeight: number
): LetterboxInfo {
  if (originalWidth <= 0 || originalHeight <= 0) {
    return {
      originalWidth: 1,
      originalHeight: 1,
      targetWidth,
      targetHeight,
      scale: 1,
      padX: 0,
      padY: 0,
    }
  }

  const scale = Math.min(targetWidth / originalWidth, targetHeight / originalHeight)
  const scaledWidth = Math.round(originalWidth * scale)
  const scaledHeight = Math.round(originalHeight * scale)
  const padX = (targetWidth - scaledWidth) / 2
  const padY = (targetHeight - scaledHeight) / 2

  return {
    originalWidth,
    originalHeight,
    targetWidth,
    targetHeight,
    scale,
    padX,
    padY,
  }
}

/**
 * Maps bounding box coordinates predicted on a letterboxed tensor back
 * to normalized [0, 1] coordinates of the original image.
 */
export function mapBBoxFromLetterbox(
  box: { x: number; y: number; width: number; height: number },
  letterbox: LetterboxInfo
): { x: number; y: number; width: number; height: number } {
  const { originalWidth, originalHeight, scale, padX, padY } = letterbox

  // Convert normalized box in target dims to absolute target coordinates
  const absX = box.x * letterbox.targetWidth
  const absY = box.y * letterbox.targetHeight
  const absW = box.width * letterbox.targetWidth
  const absH = box.height * letterbox.targetHeight

  // Remove letterbox padding and scale back to original dims
  const origX = Math.max(0, (absX - padX) / scale)
  const origY = Math.max(0, (absY - padY) / scale)
  const origW = Math.min(originalWidth - origX, absW / scale)
  const origH = Math.min(originalHeight - origY, absH / scale)

  // Re-normalize to original image dimensions [0, 1]
  const normX = Math.max(0, Math.min(1, origX / originalWidth))
  const normY = Math.max(0, Math.min(1, origY / originalHeight))
  const normW = Math.max(0.01, Math.min(1 - normX, origW / originalWidth))
  const normH = Math.max(0.01, Math.min(1 - normY, origH / originalHeight))

  return {
    x: Number(normX.toFixed(4)),
    y: Number(normY.toFixed(4)),
    width: Number(normW.toFixed(4)),
    height: Number(normH.toFixed(4)),
  }
}

/**
 * Enhances contrast using local histogram equalization approximation.
 * Critical for highlighting hairline structural cracks and subtle concrete fissures.
 */
export function enhanceCrackContrast(imageData: Uint8ClampedArray | Uint8Array): Uint8ClampedArray {
  const output = new Uint8ClampedArray(imageData.length)
  let min = 255
  let max = 0

  // Find min/max for luminance
  for (let i = 0; i < imageData.length; i += 4) {
    const luma = Math.round(0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2])
    if (luma < min) min = luma
    if (luma > max) max = luma
  }

  const range = Math.max(1, max - min)

  for (let i = 0; i < imageData.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const stretched = Math.round(((imageData[i + c] - min) / range) * 255)
      output[i + c] = Math.max(0, Math.min(255, stretched))
    }
    output[i + 3] = imageData[i + 3] ?? 255
  }

  return output
}

/**
 * Converts image pixel array (RGBA) into CHW normalized Float32Array tensor
 * formatted for ONNX Runtime / PyTorch models: [1, 3, height, width].
 */
export function imageToTensorCHW(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  config: PreprocessingConfig = DEFAULT_PREPROCESSING
): Float32Array {
  const channelSize = width * height
  const tensor = new Float32Array(3 * channelSize)
  const mean = config.mean || [0.485, 0.456, 0.406]
  const std = config.std || [0.229, 0.224, 0.225]

  for (let i = 0; i < channelSize; i++) {
    const r = pixels[i * 4] / 255.0
    const g = pixels[i * 4 + 1] / 255.0
    const b = pixels[i * 4 + 2] / 255.0

    // Channel 0 (R)
    tensor[i] = (r - mean[0]) / std[0]
    // Channel 1 (G)
    tensor[channelSize + i] = (g - mean[1]) / std[1]
    // Channel 2 (B)
    tensor[2 * channelSize + i] = (b - mean[2]) / std[2]
  }

  return tensor
}

/**
 * Calculates Intersection-over-Union (IoU) between two bounding boxes.
 */
export function calculateIoU(
  boxA: { x: number; y: number; width: number; height: number },
  boxB: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(boxA.x, boxB.x)
  const y1 = Math.max(boxA.y, boxB.y)
  const x2 = Math.min(boxA.x + boxA.width, boxB.x + boxB.width)
  const y2 = Math.min(boxA.y + boxA.height, boxB.y + boxB.height)

  const interWidth = Math.max(0, x2 - x1)
  const interHeight = Math.max(0, y2 - y1)
  const interArea = interWidth * interHeight

  const areaA = boxA.width * boxA.height
  const areaB = boxB.width * boxB.height
  const unionArea = areaA + areaB - interArea

  if (unionArea <= 0) return 0
  return Number(Math.min(1, Math.max(0, interArea / unionArea)).toFixed(6))
}

/**
 * Performs Non-Maximum Suppression (NMS) to eliminate duplicate overlapping detections.
 */
export function applyNMS<T extends { bbox: { x: number; y: number; width: number; height: number } | null; confidence: number }>(
  items: T[],
  iouThreshold: number = 0.45
): T[] {
  // Sort descending by confidence
  const sorted = [...items].sort((a, b) => b.confidence - a.confidence)
  const selected: T[] = []

  while (sorted.length > 0) {
    const current = sorted.shift()!
    if (!current.bbox) {
      selected.push(current)
      continue
    }

    selected.push(current)

    for (let i = sorted.length - 1; i >= 0; i--) {
      const candidate = sorted[i]
      if (candidate.bbox) {
        const iou = calculateIoU(current.bbox, candidate.bbox)
        if (iou >= iouThreshold) {
          sorted.splice(i, 1)
        }
      }
    }
  }

  return selected
}
