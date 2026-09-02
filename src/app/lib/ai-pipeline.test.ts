import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateLetterbox,
  mapBBoxFromLetterbox,
  calculateIoU,
  applyNMS,
  enhanceCrackContrast,
} from './ai/preprocessing'
import { calculateDefectSeverity, scoreToSeverityLevel } from './ai/severity-scoring'
import { runDetection } from './ai/inference-worker'
import type { AIModel } from '@/app/types'

describe('Phase A: Real-Time AI Damage Detection Pipeline Tests', () => {
  describe('Preprocessing & Letterbox Geometry', () => {
    test('calculateLetterbox preserves aspect ratio with centered padding', () => {
      // 1920x1080 into 640x640
      const box = calculateLetterbox(1920, 1080, 640, 640)
      assert.equal(box.targetWidth, 640)
      assert.equal(box.targetHeight, 640)
      assert.equal(box.padX, 0)
      assert.ok(box.padY > 0, 'Vertical letterbox bars expected for widescreen image')
      assert.ok(box.scale > 0)
    })

    test('mapBBoxFromLetterbox inverts letterbox transform back to normalized [0, 1] range', () => {
      const letterbox = calculateLetterbox(1920, 1080, 640, 640)
      const mapped = mapBBoxFromLetterbox({ x: 0.1, y: 0.2, width: 0.3, height: 0.2 }, letterbox)

      assert.ok(mapped.x >= 0 && mapped.x <= 1)
      assert.ok(mapped.y >= 0 && mapped.y <= 1)
      assert.ok(mapped.width > 0 && mapped.width <= 1)
      assert.ok(mapped.height > 0 && mapped.height <= 1)
    })

    test('enhanceCrackContrast stretches luminance range', () => {
      // Low contrast image buffer
      const lowContrast = new Uint8ClampedArray([50, 50, 50, 255, 60, 60, 60, 255])
      const enhanced = enhanceCrackContrast(lowContrast)
      assert.equal(enhanced.length, 8)
      assert.equal(enhanced[3], 255) // Alpha preserved
    })
  })

  describe('Non-Maximum Suppression (NMS) & IoU', () => {
    test('calculateIoU returns 1.0 for identical boxes and 0.0 for disjoint boxes', () => {
      const boxA = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }
      const boxB = { x: 0.2, y: 0.2, width: 0.4, height: 0.4 }
      const boxC = { x: 0.8, y: 0.8, width: 0.1, height: 0.1 }

      assert.equal(calculateIoU(boxA, boxB), 1.0)
      assert.equal(calculateIoU(boxA, boxC), 0.0)
    })

    test('applyNMS suppresses overlapping lower-confidence detections', () => {
      const detections = [
        { bbox: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 }, confidence: 0.95, id: '1' },
        { bbox: { x: 0.21, y: 0.21, width: 0.29, height: 0.29 }, confidence: 0.75, id: '2' }, // Overlap with 1
        { bbox: { x: 0.7, y: 0.7, width: 0.2, height: 0.2 }, confidence: 0.88, id: '3' }, // Separate
      ]

      const filtered = applyNMS(detections, 0.45)
      assert.equal(filtered.length, 2)
      assert.equal(filtered[0].id, '1')
      assert.equal(filtered[1].id, '3')
    })
  })

  describe('Severity Scoring & Civil Engineering Calibration', () => {
    test('scoreToSeverityLevel maps scores accurately', () => {
      assert.equal(scoreToSeverityLevel(85), 'critical')
      assert.equal(scoreToSeverityLevel(65), 'high')
      assert.equal(scoreToSeverityLevel(45), 'medium')
      assert.equal(scoreToSeverityLevel(20), 'low')
    })

    test('calculateDefectSeverity assigns critical tier to spalling with large area', () => {
      const { severity, severityScore } = calculateDefectSeverity(
        'spalling',
        { x: 0.2, y: 0.2, width: 0.3, height: 0.3 },
        0.92
      )
      assert.ok(severityScore >= 80, 'Large spalling must be critical severity')
      assert.equal(severity, 'critical')
    })

    test('calculateDefectSeverity assigns low tier to none defect', () => {
      const { severity, severityScore } = calculateDefectSeverity('none', null, 0.95)
      assert.equal(severityScore, 0)
      assert.equal(severity, 'low')
    })
  })

  describe('End-to-End Inference Worker', () => {
    test('runDetection executes under 3 seconds and returns structured detections', async () => {
      const mockModel: AIModel = {
        id: 'test-model-1',
        name: 'YOLOv8-Structural-V2',
        version: '2.1.0',
        task: 'detection',
        format: 'onnx',
        storage_path: null,
        labels: ['crack', 'spalling', 'corrosion'],
        is_active: true,
        architecture: 'yolov8',
        input_width: 640,
        input_height: 640,
        confidence_threshold: 0.25,
        iou_threshold: 0.45,
        created_at: new Date().toISOString(),
      }

      const result = await runDetection('img_sample_inspection_001', mockModel)

      assert.ok(result.latencyMs < 3000, 'Inference latency must be under 3 seconds')
      assert.ok(result.detections.length > 0, 'Detections array should not be empty')
      assert.equal(result.modelArchitecture, 'yolov8')
      assert.equal(result.modelVersion, '2.1.0')

      for (const d of result.detections) {
        assert.ok(d.confidence >= 0.25)
        assert.ok(d.severity_score >= 0 && d.severity_score <= 100)
        assert.ok(['low', 'medium', 'high', 'critical'].includes(d.severity))
        assert.ok(d.bbox !== null)
      }
    })
  })
})
