import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { validatePolygon, polygonArea, toSvgPath, rulerDistancePx } from './annotation/geometry'
import { rasteriseMask } from './annotation/rasterise'

describe('Annotation geometry', () => {
  test('rejects fewer than three points', () => {
    const result = validatePolygon([{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }])
    assert.equal(result.ok, false)
  })

  test('rejects coordinates outside the unit square', () => {
    const result = validatePolygon([
      { x: -0.1, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.2 },
    ])
    assert.equal(result.ok, false)
  })

  test('accepts a simple triangle and computes its area', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]
    assert.equal(validatePolygon(triangle).ok, true)
    assert.equal(polygonArea(triangle), 0.5)
  })

  test('rejects a self-intersecting bowtie', () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }]
    assert.equal(validatePolygon(bowtie).ok, false)
  })

  test('SVG path scales normalised points to pixels', () => {
    const path = toSvgPath([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }], 100, 200)
    assert.equal(path, 'M 0 0 L 50 0 L 50 100 Z')
  })

  test('ruler distance converts normalised points to pixels', () => {
    // full-width diagonal on a 100x100 image
    assert.equal(rulerDistancePx({ x: 0, y: 0 }, { x: 1, y: 1 }, 100, 100), Math.round(Math.hypot(100, 100)))
  })

  test('rasteriseMask produces a PNG of the requested size', async () => {
    const buffer = await rasteriseMask(
      { kind: 'polygon', polygon: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }] },
      64, 48
    )
    const meta = await sharp(buffer).metadata()
    assert.equal(meta.format, 'png')
    assert.equal(meta.width, 64)
    assert.equal(meta.height, 48)
  })
})
