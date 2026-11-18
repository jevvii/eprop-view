import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { CLASS_INDEX, toYoloSegLine, assignSplits, buildManifest } from './annotation/export'

describe('Dataset export', () => {
  test('class indices are stable', () => {
    assert.deepEqual(CLASS_INDEX, { crack: 0, corrosion: 1, spalling: 2, deformation: 3, leakage: 4 })
  })

  test('YOLO-seg line is class plus normalised coordinates', () => {
    const line = toYoloSegLine('crack', [
      { x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }, { x: 0.3, y: 0.5 },
    ])
    assert.equal(line, '0 0.100000 0.200000 0.300000 0.200000 0.300000 0.500000')
  })

  test('splits are deterministic for a seed and never separate one structure', () => {
    const rows = [
      { structureKey: 'b1' }, { structureKey: 'b1' }, { structureKey: 'b1' },
      { structureKey: 'b2' }, { structureKey: 'b2' },
      { structureKey: 'b3' }, { structureKey: 'b3' }, { structureKey: 'b3' },
      { structureKey: 'b4' }, { structureKey: 'b4' },
    ]
    const a = assignSplits(rows, 42)
    const b = assignSplits(rows, 42)
    assert.deepEqual(a, b)
    // same structure always lands together
    assert.equal(new Set(a.slice(0, 3)).size, 1)
    assert.equal(new Set(a.slice(3, 5)).size, 1)
  })

  test('manifest counts negatives and omitted widths', () => {
    const manifest = buildManifest({
      images: [
        { id: 'i1', structureKey: 'b1', approved: 2, negativeOnly: false, widthOmitted: 0 },
        { id: 'i2', structureKey: 'b1', approved: 0, negativeOnly: true, widthOmitted: 0 },
      ],
      seed: 42,
      generatedAt: '2026-11-18T00:00:00.000Z',
    })
    assert.equal(manifest.imageCount, 2)
    assert.equal(manifest.negativeImageCount, 1)
    assert.equal(manifest.totalApprovedAnnotations, 2)
  })
})
