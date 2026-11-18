import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { isTrainedCrackDetector, supportsLocalInference, TRAINED_CRACK_ARTIFACT } from './ai/registry'
import { trainedCrackDetectorEnabled, trainedCrackDetectorFlagState } from './ai/flags'
import { decodeImageLetterbox } from './ai/image-decoder'
import {
  loadArtifactManifest,
  loadTrainedDetector,
  runTrainedDetection,
  TRAINED_ARTIFACT_FILE,
} from './ai/onnx-detector'
import type { AIModel } from '@/app/types'

function trainedModel(overrides: Partial<AIModel> = {}): AIModel {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    name: 'DamSegment Crack Detector',
    version: '1.0.0',
    task: 'detection',
    format: 'onnx',
    storage_path: 'models/crack-ssdlite320-damsegment-v1.onnx',
    labels: ['crack'],
    is_active: true,
    architecture: 'ssdlite320_mobilenet_v3_large',
    input_width: 320,
    input_height: 320,
    confidence_threshold: 0.3,
    iou_threshold: 0.5,
    preprocessing: {},
    metadata: { artifact: TRAINED_CRACK_ARTIFACT },
    created_at: new Date(0).toISOString(),
    ...overrides,
  }
}

async function syntheticCrackPhoto(width = 640, height = 480): Promise<Buffer> {
  // A dark meandering line on textured grey concrete, drawn with raw pixels so
  // the fixture needs no external asset.
  const raw = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      const noise = ((x * 7 + y * 13) % 23) - 11
      const base = 150 + noise
      const onCrack = Math.abs(y - (height / 2 + Math.sin(x / 40) * 60)) < 2.5
      const value = onCrack ? 35 : base
      raw[i] = value
      raw[i + 1] = value
      raw[i + 2] = value
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer()
}

describe('trained crack detector: registry and feature flag', () => {
  test('only the pinned onnx artifact is treated as a runnable trained detector', () => {
    assert.equal(isTrainedCrackDetector(trainedModel()), true)
    assert.equal(supportsLocalInference(trainedModel()), true)
    // A generic onnx row must never be selected as the fitted model.
    assert.equal(isTrainedCrackDetector(trainedModel({ metadata: {} })), false)
    assert.equal(supportsLocalInference(trainedModel({ metadata: { artifact: 'some-other-model' } })), false)
  })

  test('the heuristic remains a supported local method', () => {
    const heuristic = trainedModel({ format: 'heuristic', metadata: { engine: 'heuristic' } })
    assert.equal(supportsLocalInference(heuristic), true)
    assert.equal(isTrainedCrackDetector(heuristic), false)
  })

  test('the flag defaults off and is refused on production', () => {
    const original = { ...process.env }
    try {
      delete process.env.TRAINED_CRACK_DETECTOR
      delete process.env.VERCEL_ENV
      assert.equal(trainedCrackDetectorEnabled(), false)
      assert.equal(trainedCrackDetectorFlagState(), 'off')

      process.env.TRAINED_CRACK_DETECTOR = 'on'
      process.env.VERCEL_ENV = 'preview'
      assert.equal(trainedCrackDetectorEnabled(), true)
      assert.equal(trainedCrackDetectorFlagState(), 'on')

      process.env.VERCEL_ENV = 'production'
      assert.equal(trainedCrackDetectorEnabled(), false)
      assert.equal(trainedCrackDetectorFlagState(), 'blocked-production')
    } finally {
      process.env = original
    }
  })
})

describe('trained crack detector: letterbox decode', () => {
  test('preserves aspect ratio and pads with mid-grey', async () => {
    const photo = await syntheticCrackPhoto(640, 480)
    const decoded = await decodeImageLetterbox(photo, 320, 320)
    assert.equal(decoded.pixels.length, 320 * 320 * 4)
    assert.equal(decoded.letterbox.scale, 0.5)
    assert.equal(decoded.letterbox.padY, 40)
    assert.equal(decoded.letterbox.padX, 0)

    // Top-left pixel is padding, not image content.
    assert.equal(decoded.pixels[0], 128)
    assert.equal(decoded.pixels[1], 128)
    // The centre row is real image.
    const centre = ((160 * 320) + 5) * 4
    assert.notEqual(decoded.pixels[centre], 128)
  })
})

const artifactPath = path.join(process.cwd(), TRAINED_ARTIFACT_FILE)
const hasArtifact = fs.existsSync(artifactPath)

describe('trained crack detector: exported runtime parity', { skip: hasArtifact ? false : 'artifact not exported yet' }, () => {
  test('the manifest pins a sha256 that matches the shipped bytes', async () => {
    const manifest = await loadArtifactManifest()
    assert.match(manifest.sha256, /^[0-9a-f]{64}$/)
    assert.equal(manifest.artifact, TRAINED_CRACK_ARTIFACT)
    assert.equal(manifest.input_size, 320)
    assert.ok(manifest.bytes > 100_000)
  })

  test('a registry checksum that disagrees with the manifest is refused', async () => {
    await assert.rejects(
      () => loadTrainedDetector('0'.repeat(64)),
      /disagrees with the bundled artifact manifest/,
    )
  })

  test('every reported box is finite, normalized and inside the frame', async () => {
    const photo = await syntheticCrackPhoto()
    const result = await runTrainedDetection(photo, trainedModel({ confidence_threshold: 0.01 }))
    assert.ok(result.detections.length <= 50)
    for (const d of result.detections) {
      assert.equal(d.damage_type, 'crack')
      assert.equal(d.provenance, 'model')
      assert.ok(d.confidence >= 0 && d.confidence <= 1)
      const b = d.bbox!
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height))
      assert.ok(b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0)
      assert.ok(b.x + b.width <= 1.0001 && b.y + b.height <= 1.0001)
    }
  })

  test('a score threshold above every prediction is a valid empty result', async () => {
    const photo = await syntheticCrackPhoto()
    // Softmax over three classes cannot reach exactly 1.0, so a threshold of 1
    // admits nothing while still exercising the real filtering path.
    const result = await runTrainedDetection(photo, trainedModel({ confidence_threshold: 1 }))
    assert.equal(result.detections.length, 0)
    assert.equal(result.crackCount, 0)
  })

  test('repeated runs on the same bytes are deterministic', async () => {
    const photo = await syntheticCrackPhoto()
    const a = await runTrainedDetection(photo, trainedModel({ confidence_threshold: 0.05 }))
    const b = await runTrainedDetection(photo, trainedModel({ confidence_threshold: 0.05 }))
    assert.deepEqual(a.detections.map((d) => d.bbox), b.detections.map((d) => d.bbox))
    assert.deepEqual(a.detections.map((d) => d.confidence), b.detections.map((d) => d.confidence))
  })
})
