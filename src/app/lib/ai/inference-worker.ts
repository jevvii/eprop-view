import type { AIModel, AIDamageDetection, DamageType, BoundingBox } from '@/app/types'
import {
  applyNMS,
  enhanceCrackContrast,
  imageToTensorCHW,
  DEFAULT_PREPROCESSING,
  type PreprocessingConfig,
} from './preprocessing'
import { calculateDefectSeverity } from './severity-scoring'
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
  const cellW = Math.floor(width / gridX)
  const cellH = Math.floor(height / gridY)

  for (let gy = 1; gy < gridY - 1; gy++) {
    for (let gx = 1; gx < gridX - 1; gx++) {
      let rSum = 0
      let bSum = 0
      let edgeGradientSum = 0
      let sampleCount = 0

      for (let y = gy * cellH; y < (gy + 1) * cellH; y += 4) {
        for (let x = gx * cellW; x < (gx + 1) * cellW; x += 4) {
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

          sampleCount++
        }
      }

      if (sampleCount === 0) continue

      const avgR = rSum / sampleCount
      const avgB = bSum / sampleCount
      const avgGrad = edgeGradientSum / sampleCount

      if (avgGrad > 0.45) {
        candidates.push({
          damageType: 'crack',
          bbox: {
            x: Number((gx / gridX).toFixed(3)),
            y: Number((gy / gridY).toFixed(3)),
            width: Number((2 / gridX).toFixed(3)),
            height: Number((1.5 / gridY).toFixed(3)),
          },
          rawConfidence: Number(Math.min(0.96, Math.max(0.6, 0.65 + avgGrad * 0.25)).toFixed(2)),
        })
      }

      if (avgR - avgB > 0.6) {
        candidates.push({
          damageType: 'corrosion',
          bbox: {
            x: Number((gx / gridX).toFixed(3)),
            y: Number((gy / gridY).toFixed(3)),
            width: Number((2.5 / gridX).toFixed(3)),
            height: Number((2 / gridY).toFixed(3)),
          },
          rawConfidence: Number(Math.min(0.94, Math.max(0.65, 0.7 + (avgR - avgB) * 0.2)).toFixed(2)),
        })
      }

      if (avgR < -0.5 && avgGrad > 0.3) {
        candidates.push({
          damageType: 'spalling',
          bbox: {
            x: Number((gx / gridX).toFixed(3)),
            y: Number((gy / gridY).toFixed(3)),
            width: Number((2.2 / gridX).toFixed(3)),
            height: Number((2.2 / gridY).toFixed(3)),
          },
          rawConfidence: Number(Math.min(0.95, Math.max(0.68, 0.75 + avgGrad * 0.2)).toFixed(2)),
        })
      }
    }
  }

  return candidates
}

function clampBox(box: BoundingBox): BoundingBox {
  const x = Math.min(1, Math.max(0, box.x))
  const y = Math.min(1, Math.max(0, box.y))
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    width: Number(Math.min(1 - x, Math.max(0, box.width)).toFixed(4)),
    height: Number(Math.min(1 - y, Math.max(0, box.height)).toFixed(4)),
  }
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

  const inputWidth = options?.imageWidth || model.input_width || DEFAULT_PREPROCESSING.inputWidth
  const inputHeight = options?.imageHeight || model.input_height || DEFAULT_PREPROCESSING.inputHeight
  const confThreshold = model.confidence_threshold ?? 0.25
  const iouThreshold = model.iou_threshold ?? 0.45

  const decoded = await decodeImage(imageInput, inputWidth, inputHeight)
  const enhancedPixels = enhanceCrackContrast(decoded.pixels)

  const tensor = imageToTensorCHW(
    enhancedPixels,
    inputWidth,
    inputHeight,
    (model.preprocessing as PreprocessingConfig | undefined) ?? DEFAULT_PREPROCESSING
  )
  const rawDetections = extractDetectionsFromTensor(tensor, inputWidth, inputHeight)

  const thresholded = rawDetections.filter((d) => d.rawConfidence >= confThreshold)

  const mappedDetections = thresholded.map((d) => {
    const box = clampBox(d.bbox)
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

  const finalDetections = applyNMS(mappedDetections, iouThreshold)

  return {
    detections: finalDetections,
    latencyMs: Math.round(performance.now() - startTime),
    modelArchitecture: model.architecture || 'heuristic',
    modelVersion: model.version,
    tensorDimensions: [1, 3, inputHeight, inputWidth],
  }
}
