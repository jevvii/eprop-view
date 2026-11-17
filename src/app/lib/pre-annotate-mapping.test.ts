import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapDetectionToCandidate, isPlausibleBbox } from './annotation/mapping'

test('maps a detection to a box candidate', () => {
  const candidate = mapDetectionToCandidate({
    damage_type: 'crack', severity: 'high', severity_score: 70,
    confidence: 0.62, bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
  })
  assert.equal(candidate.geometryKind, 'box')
  assert.equal(candidate.damageType, 'crack')
  assert.equal(candidate.sourceConfidence, 0.62)
})

test('rejects degenerate boxes', () => {
  assert.equal(isPlausibleBbox({ x: 0, y: 0, width: 0, height: 0.2 }), false)
  assert.equal(isPlausibleBbox({ x: 1.1, y: 0, width: 0.2, height: 0.2 }), false)
  assert.equal(isPlausibleBbox({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }), true)
})
