import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  orientedDimensions,
  rescaleGsdToStored,
  gsdFromReference,
  computeTrainingEligible,
  deriveCrackWidthMm,
  MIN_TRAINING_PIXELS,
} from './capture/geometry'

describe('Capture geometry', () => {
  test('orientation 6 swaps width and height', () => {
    assert.deepEqual(orientedDimensions({ width: 4032, height: 3024, orientation: 6 }), { width: 3024, height: 4032 })
    assert.deepEqual(orientedDimensions({ width: 4032, height: 3024, orientation: 1 }), { width: 4032, height: 3024 })
    assert.deepEqual(orientedDimensions({ width: 4032, height: 3024, orientation: 8 }), { width: 3024, height: 4032 })
  })

  test('missing dimensions throw rather than guessing', () => {
    assert.throws(() => orientedDimensions({ width: undefined, height: 100 }))
  })

  test('GSD rescales from source to stored pixels', () => {
    // 0.1 mm/px at 4032 px wide; stored at 2016 px wide -> twice the mm per px
    assert.equal(rescaleGsdToStored(0.1, 4032, 2016), 0.2)
    assert.equal(rescaleGsdToStored(0.1, 4032, 4032), 0.1)
  })

  test('GSD from a printed reference target', () => {
    // 100 mm target spanning 800 px -> 0.125 mm/px
    assert.equal(gsdFromReference(100, 800), 0.125)
    assert.throws(() => gsdFromReference(100, 0))
  })

  test('eligibility requires the pixel floor and rejects synthetic or unusable', () => {
    assert.equal(computeTrainingEligible({ widthPx: 2000, heightPx: 1500 }), true)
    assert.equal(computeTrainingEligible({ widthPx: 1000, heightPx: 1000 }), false)
    assert.equal(computeTrainingEligible({ widthPx: 2000, heightPx: 1500, synthetic: true }), false)
    assert.equal(computeTrainingEligible({ widthPx: 2000, heightPx: 1500, unusable: true }), false)
    assert.equal(MIN_TRAINING_PIXELS, 1_500_000)
  })

  test('crack width derives only when scale is known', () => {
    assert.equal(deriveCrackWidthMm(4, 0.25), 1)
    assert.equal(deriveCrackWidthMm(4, null), null)
    assert.equal(deriveCrackWidthMm(null, 0.25), null)
  })
})
