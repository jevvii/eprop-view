import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { shouldSnapshotCandidate, geometryChanged } from './annotation/lifecycle'
import { buildManifest } from './annotation/export'

describe('Candidate provenance', () => {
  test('a notes-only edit does not claim the candidate as manual', () => {
    const current = {
      source: 'heuristic' as const,
      original_geometry: null,
      polygon: null,
      bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      damage_type: 'crack' as const,
    }
    assert.equal(geometryChanged(current, {}), false)
    assert.equal(shouldSnapshotCandidate(current, {}), false)
  })

  test('a geometry edit snapshots the candidate once', () => {
    const current = {
      source: 'heuristic' as const,
      original_geometry: null,
      polygon: null,
      bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      damage_type: 'crack' as const,
    }
    const next = { bbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } }
    assert.equal(geometryChanged(current, next), true)
    assert.equal(shouldSnapshotCandidate(current, next), true)
  })

  test('manual annotations are never re-snapshotted', () => {
    const current = {
      source: 'manual' as const,
      original_geometry: null,
      polygon: null,
      bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
      damage_type: 'crack' as const,
    }
    assert.equal(shouldSnapshotCandidate(current, { bbox: null }), false)
  })
})

describe('Manifest provenance', () => {
  test('records class counts, scale coverage and a content hash', () => {
    const manifest = buildManifest({
      images: [
        { id: 'i1', structureKey: 'b1', approved: 2, negativeOnly: false, widthOmitted: 1,
          classes: { crack: 1, corrosion: 1 }, scaleSource: 'printed_reference', gsdKnown: true },
        { id: 'i2', structureKey: 'b2', approved: 1, negativeOnly: false, widthOmitted: 0,
          classes: { crack: 1 }, scaleSource: 'unknown', gsdKnown: false },
        { id: 'i3', structureKey: 'b2', approved: 0, negativeOnly: true, widthOmitted: 0,
          classes: {}, scaleSource: 'unknown', gsdKnown: false },
      ],
      seed: 42,
      generatedAt: '2026-11-18T00:00:00.000Z',
    })
    assert.deepEqual(manifest.classCounts, { crack: 2, corrosion: 1 })
    assert.equal(manifest.gsdCoverage, 1 / 3)
    assert.deepEqual(manifest.scaleSourceDistribution, { printed_reference: 1, unknown: 2 })
    assert.match(manifest.contentHash, /^[0-9a-f]{16}$/)
  })
})
