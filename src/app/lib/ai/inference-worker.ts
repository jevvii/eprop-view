import type { AIModel, AIDamageDetection, DamageType, BoundingBox } from '@/app/types'
import {
  applyNMS,
  enhanceCrackContrast,
  imageToTensorCHW,
  DEFAULT_PREPROCESSING,
  type PreprocessingConfig,
} from './preprocessing'
import { calculateDefectSeverity } from './severity-scoring'
import { supportsLocalInference } from './registry'
import { decodeImage } from './image-decoder'

export interface InferenceResult {
  detections: Omit<AIDamageDetection, 'id' | 'created_at' | 'verified_by' | 'verified_at'>[]
  latencyMs: number
  modelArchitecture: string
  modelVersion: string
  tensorDimensions?: [number, number, number, number]
}

/**
 * Structural-defect heuristic over a normalized CHW tensor.
 *
 * This is NOT a trained detector. It finds high-gradient regions (crack-like),
 * red/blue channel divergence (rust-like) and dark rough regions (spall-like).
 * It returns nothing when the image does not trip the thresholds.
 */
function extractDetectionsFromTensor(
  tensor: Float32Array,
  width: number,
  height: number
): { damageType: DamageType; bbox: BoundingBox; rawConfidence: number }[] {
  const channelSize = width * height
  const candidates: { damageType: DamageType; bbox: BoundingBox; rawConfidence: number }[] = []

  const gridX = 8
  const gridY = 8
  const cellW = width / gridX
  const cellH = height / gridY

  for (let gy = 0; gy < gridY; gy++) {
    for (let gx = 0; gx < gridX; gx++) {
      let rSum = 0
      let bSum = 0
      let edgeGradientSum = 0
      let sampleCount = 0
      let darkRidgePixels = 0

      for (let y = Math.floor(gy * cellH); y < Math.floor((gy + 1) * cellH); y++) {
        for (let x = Math.floor(gx * cellW); x < Math.floor((gx + 1) * cellW); x++) {
          const idx = y * width + x
          if (idx >= channelSize) continue

          const r = tensor[idx]
          const b = tensor[2 * channelSize + idx]

          rSum += r
          bSum += b

          if (x + 1 < width && y + 1 < height) {
            const nextX = y * width + (x + 1)
            const nextY = (y + 1) * width + x
            edgeGradientSum += Math.abs(tensor[nextX] - r) + Math.abs(tensor[nextY] - r)
          }

          // Opposing brighter neighbours distinguish narrow dark lines from
          // the single edge of a coloured patch. Sample every pixel so a
          // one-pixel line cannot fall between samples.
          const horizontal = x >= 2 && x < width - 2 &&
            Math.min(tensor[idx - 2], tensor[idx + 2]) - r > 0.8
          const vertical = y >= 2 && y < height - 2 &&
            Math.min(tensor[idx - 2 * width], tensor[idx + 2 * width]) - r > 0.8
          if (horizontal || vertical) darkRidgePixels++
          sampleCount++
        }
      }

      if (sampleCount === 0) continue

      const avgR = rSum / sampleCount
      const avgB = bSum / sampleCount
      const avgGrad = edgeGradientSum / sampleCount

      const bbox = { x: gx / gridX, y: gy / gridY, width: 1 / gridX, height: 1 / gridY }
      if (avgGrad > 0.45 || darkRidgePixels >= Math.max(6, Math.min(cellW, cellH) * 0.5)) {
        candidates.push({
          damageType: 'crack',
          bbox,
          rawConfidence: Number(Math.min(0.96, Math.max(0.6, 0.65 + avgGrad * 0.25)).toFixed(2)),
        })
      }

      if (avgR - avgB > 0.6) {
        candidates.push({
          damageType: 'corrosion',
          bbox,
          rawConfidence: Number(Math.min(0.94, Math.max(0.65, 0.7 + (avgR - avgB) * 0.2)).toFixed(2)),
        })
      }

      if (avgR < -0.5 && avgGrad > 0.3) {
        candidates.push({
          damageType: 'spalling',
          bbox,
          rawConfidence: Number(Math.min(0.95, Math.max(0.68, 0.75 + avgGrad * 0.2)).toFixed(2)),
        })
      }
    }
  }

  return candidates
}

/**
 * Runs the structural-defect heuristic on real image bytes.
 * Accepts a Blob or ArrayBuffer only — never an identifier used to fake pixels.
 */
export async function runDetection(
  imageInput: Blob | ArrayBuffer | Uint8Array,
  model: AIModel,
  options?: { imageWidth?: number; imageHeight?: number }
): Promise<InferenceResult> {
  const startTime = performance.now()

  if (!supportsLocalInference(model)) throw new Error('Only the local heuristic detection method can run here.')
  const inputWidth = options?.imageWidth ?? model.input_width ?? DEFAULT_PREPROCESSING.inputWidth
  const inputHeight = options?.imageHeight ?? model.input_height ?? DEFAULT_PREPROCESSING.inputHeight
  const confThreshold = model.confidence_threshold ?? 0.25
  const iouThreshold = model.iou_threshold ?? 0.45

  if (![inputWidth, inputHeight].every(n => Number.isInteger(n) && n >= 8 && n <= 1024)) {
    throw new Error('Heuristic input dimensions must be integers between 8 and 1024.')
  }
  if (![confThreshold, iouThreshold].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) {
    throw new Error('Invalid heuristic threshold.')
  }
  const config = (model.preprocessing ?? {}) as Partial<PreprocessingConfig>
  for (const values of [config.mean, config.std]) {
    if (values !== undefined && (!Array.isArray(values) || values.length !== 3 || !values.every(Number.isFinite))) {
      throw new Error('Invalid heuristic channel normalization.')
    }
  }
  if (config.std?.some(n => n <= 0)) throw new Error('Channel standard deviations must be positive.')
  const decoded = await decodeImage(imageInput, inputWidth, inputHeight)
  const enhancedPixels = config.applyContrastEnhancement === false ? decoded.pixels : enhanceCrackContrast(decoded.pixels)

  const tensor = imageToTensorCHW(
    enhancedPixels,
    inputWidth,
    inputHeight,
    { ...DEFAULT_PREPROCESSING, ...config }
  )
  const rawDetections = extractDetectionsFromTensor(tensor, inputWidth, inputHeight)

  const thresholded = rawDetections.filter((d) => d.rawConfidence >= confThreshold)

  const mappedDetections = thresholded.map((d) => {
    const box = d.bbox
    const { severityScore, severity } = calculateDefectSeverity(d.damageType, box, d.rawConfidence)

    return {
      image_id: 'in_memory_capture',
      model_id: model.id,
      damage_type: d.damageType,
      severity,
      severity_score: severityScore,
      confidence: d.rawConfidence,
      bbox: box,
      mask_url: null,
      provenance: 'heuristic' as const,
      notes: `Heuristic edge/colour analysis (non-ML) on ${decoded.format} ${decoded.sourceWidth}×${decoded.sourceHeight}. Confidence reflects heuristic strength, not a trained classifier.`,
    }
  })

  const finalDetections = applyNMS(mappedDetections, iouThreshold).slice(0, 100)

  return {
    detections: finalDetections,
    latencyMs: Math.round(performance.now() - startTime),
    modelArchitecture: 'heuristic',
    modelVersion: model.version,
    tensorDimensions: [1, 3, inputHeight, inputWidth],
  }
}
