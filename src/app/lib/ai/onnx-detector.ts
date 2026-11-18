import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AIModel, AIDamageDetection, BoundingBox } from '@/app/types'
import { calculateDefectSeverity } from './severity-scoring'
import { isTrainedCrackDetector } from './registry'
import { decodeImageLetterbox } from './image-decoder'
import { mapBBoxFromLetterbox } from './preprocessing'

/**
 * Server-side inference for the project-fine-tuned crack detector.
 *
 * The exported ONNX graph contains the TorchVision transform (resize +
 * normalization) and the SSD post-process (score threshold + NMS). This module
 * therefore only letterboxes to 320x320, divides by 255 and maps boxes back.
 */

export const TRAINED_ARTIFACT_FILE = path.join(
  'src', 'app', 'lib', 'ai', 'models', 'crack-ssdlite320-damsegment-v1.onnx',
)
export const TRAINED_ARTIFACT_MANIFEST = path.join(
  'src', 'app', 'lib', 'ai', 'models', 'crack-ssdlite320-damsegment-v1.json',
)
const DEFAULT_INPUT_SIZE = 320
const LABEL_CRACK = 1
const INFERENCE_TIMEOUT_MS = 20_000
const MAX_DETECTIONS = 50

export interface TrainedInferenceResult {
  detections: Omit<AIDamageDetection, 'id' | 'created_at' | 'verified_by' | 'verified_at'>[]
  latencyMs: number
  modelArchitecture: string
  modelVersion: string
  artifactSha256: string
  tensorDimensions: [number, number, number, number]
  crackCount: number
}

interface LoadedDetector {
  // Kept untyped on purpose: importing the native runtime at module scope would
  // pull it into every server bundle that merely references this file.
  session: {
    inputNames: readonly string[]
    run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array | Int32Array | BigInt64Array; dims: number[] }>>
  }
  sha256: string
}

export interface ArtifactManifest {
  artifact: string
  version: string
  sha256: string
  bytes: number
  input_size: number
  labels: string[]
  trained_on: string
  dataset_doi: string
  [key: string]: unknown
}

const cache = new Map<string, Promise<LoadedDetector>>()
let manifestPromise: Promise<ArtifactManifest> | null = null

/**
 * Read the bundled artifact with literal paths.
 *
 * The path must be statically analyzable: a dynamic path makes webpack's file
 * tracer include all of node_modules, which pushes the Vercel function over its
 * 250 MB limit. Reading bytes and handing a buffer to ONNX Runtime also removes
 * the need to resolve a path at run time.
 */
async function readBundledManifest(): Promise<string> {
  try {
    return await fs.readFile(
      path.join(process.cwd(), 'src', 'app', 'lib', 'ai', 'models', 'crack-ssdlite320-damsegment-v1.json'),
      'utf8',
    )
  } catch {
    return await fs.readFile(
      path.join(process.cwd(), '.next', 'server', 'src', 'app', 'lib', 'ai', 'models', 'crack-ssdlite320-damsegment-v1.json'),
      'utf8',
    )
  }
}

async function readBundledArtifact(): Promise<Buffer> {
  try {
    return await fs.readFile(
      path.join(process.cwd(), 'src', 'app', 'lib', 'ai', 'models', 'crack-ssdlite320-damsegment-v1.onnx'),
    )
  } catch {
    return await fs.readFile(
      path.join(process.cwd(), '.next', 'server', 'src', 'app', 'lib', 'ai', 'models', 'crack-ssdlite320-damsegment-v1.onnx'),
    )
  }
}

/**
 * The committed manifest is the authoritative pin. If the registry disagrees,
 * the model is not loaded at all.
 */
export async function loadArtifactManifest(): Promise<ArtifactManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      let text: string
      try {
        text = await readBundledManifest()
      } catch {
        throw new Error('Trained detector artifact manifest is not present in this deployment.')
      }
      const parsed = JSON.parse(text) as ArtifactManifest
      if (!parsed.sha256 || !/^[0-9a-f]{64}$/.test(parsed.sha256)) {
        throw new Error('Trained detector artifact manifest has no valid sha256 pin.')
      }
      return parsed
    })()
    manifestPromise.catch(() => { manifestPromise = null })
  }
  return manifestPromise
}

/**
 * Load and verify the pinned artifact once per process. A checksum mismatch is
 * a hard failure: an unverified model must never produce a finding.
 */
export async function loadTrainedDetector(registrySha256?: string): Promise<LoadedDetector> {
  const manifest = await loadArtifactManifest()
  if (registrySha256 && registrySha256 !== manifest.sha256) {
    throw new Error(
      `Registry checksum ${registrySha256.slice(0, 12)}… disagrees with the bundled artifact manifest ${manifest.sha256.slice(0, 12)}….`,
    )
  }
  const key = manifest.sha256
  const existing = cache.get(key)
  if (existing) return existing

  const pending = (async () => {
    let bytes: Buffer
    try {
      bytes = await readBundledArtifact()
    } catch {
      throw new Error('Trained detector artifact is not present in this deployment.')
    }
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex')
    if (sha256 !== manifest.sha256) {
      throw new Error(
        `Trained detector artifact failed its checksum (expected ${manifest.sha256.slice(0, 12)}…, found ${sha256.slice(0, 12)}…).`,
      )
    }
    const ort = await import('onnxruntime-node')
    const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      logSeverityLevel: 3,
    })
    return { session: session as unknown as LoadedDetector['session'], sha256 }
  })()

  cache.set(key, pending)
  pending.catch(() => cache.delete(key))
  return pending
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Trained detector inference exceeded ${ms} ms.`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Runs the fitted detector on real image bytes. The exported graph emits boxes
 * in the 320x320 letterbox space; they are mapped back to normalized original
 * coordinates so the overlay and the annotator agree.
 */
export async function runTrainedDetection(imageInput: Blob | ArrayBuffer | Uint8Array, model: AIModel): Promise<TrainedInferenceResult> {
  const startTime = performance.now()
  if (!isTrainedCrackDetector(model)) throw new Error('This model is not the registered trained crack detector.')

  const metadata = (model.metadata ?? {}) as Record<string, unknown>
  const expectedSha = typeof metadata.artifact_sha256 === 'string' ? metadata.artifact_sha256 : ''
  const scoreThreshold = model.confidence_threshold ?? 0.3
  if (!Number.isFinite(scoreThreshold) || scoreThreshold <= 0 || scoreThreshold > 1) {
    throw new Error('Trained detector score threshold is invalid.')
  }

  const manifest = await loadArtifactManifest()
  const inputSize = Number(manifest.input_size) > 0 ? Number(manifest.input_size) : DEFAULT_INPUT_SIZE
  const { session, sha256 } = await loadTrainedDetector(expectedSha)

  const decoded = await decodeImageLetterbox(imageInput, inputSize, inputSize)
  const { letterbox, pixels } = decoded
  const plane = inputSize * inputSize
  const tensor = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    tensor[i] = pixels[i * 4] / 255
    tensor[plane + i] = pixels[i * 4 + 1] / 255
    tensor[2 * plane + i] = pixels[i * 4 + 2] / 255
  }

  const ort = await import('onnxruntime-node')
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, inputSize, inputSize]) }
  const outputs = await withTimeout(session.run(feeds), INFERENCE_TIMEOUT_MS)

  const boxes = outputs.boxes
  const scores = outputs.scores
  const labels = outputs.labels
  if (!boxes || !scores || !labels) throw new Error('Trained detector returned an unexpected output shape.')

  const count = Math.min(scores.dims[0] ?? 0, boxes.dims[0] ?? 0)
  const candidates: { bbox: BoundingBox; score: number }[] = []
  for (let i = 0; i < count; i++) {
    if (Number(labels.data[i]) !== LABEL_CRACK) continue
    const score = Number(scores.data[i])
    if (!Number.isFinite(score) || score < scoreThreshold) continue
    // ORT may return int64 tensors as BigInt; coordinates are always numeric.
    const coords = [0, 1, 2, 3].map((k) => Number(boxes.data[i * 4 + k]))
    if (!coords.every(Number.isFinite)) continue
    const x1 = Math.max(0, Math.min(inputSize, coords[0]))
    const y1 = Math.max(0, Math.min(inputSize, coords[1]))
    const x2 = Math.max(0, Math.min(inputSize, coords[2]))
    const y2 = Math.max(0, Math.min(inputSize, coords[3]))
    if (x2 - x1 < 1 || y2 - y1 < 1) continue
    const mapped = mapBBoxFromLetterbox(
      { x: x1 / inputSize, y: y1 / inputSize, width: (x2 - x1) / inputSize, height: (y2 - y1) / inputSize },
      letterbox,
    )
    // Size first, then position, so enforcing a minimum size can never push the
    // box past the frame. x + width <= 1 and y + height <= 1 hold exactly.
    const bw = Number(Math.max(0.001, Math.min(1, mapped.width)).toFixed(4))
    const bh = Number(Math.max(0.001, Math.min(1, mapped.height)).toFixed(4))
    const bbox: BoundingBox = {
      x: Number(Math.max(0, Math.min(1 - bw, mapped.x)).toFixed(4)),
      y: Number(Math.max(0, Math.min(1 - bh, mapped.y)).toFixed(4)),
      width: bw,
      height: bh,
    }
    candidates.push({ bbox, score })
  }

  candidates.sort((a, b) => b.score - a.score)
  const detections = candidates.slice(0, MAX_DETECTIONS).map(({ bbox, score }) => {
    const { severityScore, severity } = calculateDefectSeverity('crack', bbox, score)
    return {
      image_id: 'in_memory_capture',
      model_id: model.id,
      damage_type: 'crack' as const,
      severity,
      severity_score: severityScore,
      confidence: Number(score.toFixed(4)),
      bbox,
      mask_url: null,
      provenance: 'model' as const,
      notes: `Trained SSDLite320 crack detector (${model.name} v${model.version}, artifact ${sha256.slice(0, 12)}…). Detection score ${score.toFixed(3)} on ${decoded.sourceWidth}×${decoded.sourceHeight}.`,
    }
  })

  return {
    detections,
    latencyMs: Math.round(performance.now() - startTime),
    modelArchitecture: model.architecture ?? 'ssdlite320_mobilenetv3_large',
    modelVersion: model.version,
    artifactSha256: sha256,
    tensorDimensions: [1, 3, inputSize, inputSize],
    crackCount: detections.length,
  }
}
