import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  ACI_224R_EXPOSURE_LIMITS_MM,
  assessCrack,
  classifyCrackWidth,
  exceedsAciLimit,
} from './structural/crack-taxonomy'
import { checkDivergence, formatPhp, tableEstimate, tableRange } from './structural/cost-table'
import {
  DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM,
  TILT_THRESHOLDS_MM_PER_M,
  classifyDifferentialSettlement,
  classifySettlement,
  classifyTilt,
} from './structural/settlement'
import { rejectOutliers, summarizeReadings } from './structural/rebound'

describe('Crack taxonomy (ACI 224R-01 / ACI 201.1R)', () => {
  test('classifies each width band at its boundaries', () => {
    assert.equal(classifyCrackWidth(0), 'hairline')
    assert.equal(classifyCrackWidth(0.05), 'hairline')
    assert.equal(classifyCrackWidth(0.1), 'hairline')
    assert.equal(classifyCrackWidth(0.11), 'fine')
    assert.equal(classifyCrackWidth(0.3), 'fine')
    assert.equal(classifyCrackWidth(0.31), 'medium')
    assert.equal(classifyCrackWidth(1.0), 'medium')
    assert.equal(classifyCrackWidth(1.01), 'wide')
    assert.equal(classifyCrackWidth(2.0), 'wide')
    assert.equal(classifyCrackWidth(2.01), 'severe')
    assert.equal(classifyCrackWidth(20), 'severe')
  })

  test('rejects negative and non-numeric widths rather than silently classifying them', () => {
    assert.throws(() => classifyCrackWidth(-1), RangeError)
    assert.throws(() => classifyCrackWidth(Number.NaN), RangeError)
  })

  test('applies the exposure-specific ACI limit', () => {
    assert.equal(ACI_224R_EXPOSURE_LIMITS_MM.dry_air, 0.1)
    assert.equal(ACI_224R_EXPOSURE_LIMITS_MM.water_retaining, 0.3)

    // 0.2 mm passes in a water-retaining structure but fails in dry air.
    assert.equal(exceedsAciLimit(0.2, 'dry_air'), true)
    assert.equal(exceedsAciLimit(0.2, 'water_retaining'), false)
    assert.equal(exceedsAciLimit(0.1, 'dry_air'), false)
  })

  test('assessCrack returns a traceable reference string', () => {
    const assessment = assessCrack(0.5, 'humid')
    assert.equal(assessment.band, 'medium')
    assert.equal(assessment.exceedsAciLimit, true)
    assert.equal(assessment.aciLimitMm, 0.15)
    assert.match(assessment.reference, /ACI 224R-01/)
  })
})

describe('Cost table and divergence', () => {
  test('scales by element importance', () => {
    const slab = tableEstimate('crack', 'medium', 'slab')
    const column = tableEstimate('crack', 'medium', 'column')
    const foundation = tableEstimate('crack', 'medium', 'foundation')

    assert.ok(column > slab, 'column repair should cost more than slab')
    assert.ok(foundation > column, 'foundation repair should cost more than column')
  })

  test('returns zero for a non-defect', () => {
    assert.equal(tableEstimate('none', 'critical', 'column'), 0)
  })

  test('tableRange brackets the likely value', () => {
    const range = tableRange(10_000)
    assert.ok(range.low < range.likely)
    assert.ok(range.high > range.likely)
    assert.equal(range.likely, 10_000)
  })

  test('flags divergence outside the accepted band', () => {
    const within = checkDivergence(12_000, 10_000)
    assert.equal(within.divergent, false)
    assert.ok(within.ratio !== null && Math.abs(within.ratio - 1.2) < 0.001)

    const tooHigh = checkDivergence(30_000, 10_000)
    assert.equal(tooHigh.divergent, true)

    const tooLow = checkDivergence(2_000, 10_000)
    assert.equal(tooLow.divergent, true)
  })

  test('treats a missing AI figure as "nothing to compare", not divergence', () => {
    assert.equal(checkDivergence(null, 10_000).divergent, false)
    assert.equal(checkDivergence(undefined, 10_000).divergent, false)
  })

  test('a table value of zero with a positive AI figure is divergent', () => {
    const result = checkDivergence(5_000, 0)
    assert.equal(result.divergent, true)
  })

  test('formats peso amounts for display', () => {
    assert.match(formatPhp(12_500), /12,500/)
    assert.equal(formatPhp(null), '—')
  })
})

describe('Tilt and settlement classification', () => {
  test('classifies tilt against the documented thresholds', () => {
    assert.equal(classifyTilt(0), 'none')
    assert.equal(classifyTilt(TILT_THRESHOLDS_MM_PER_M.monitor), 'none')
    assert.equal(classifyTilt(2.5), 'monitor')
    assert.equal(classifyTilt(TILT_THRESHOLDS_MM_PER_M.action), 'monitor')
    assert.equal(classifyTilt(4.5), 'action_required')
  })

  test('classifies differential settlement', () => {
    assert.equal(classifyDifferentialSettlement(0), 'none')
    assert.equal(classifyDifferentialSettlement(DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.monitor), 'none')
    assert.equal(classifyDifferentialSettlement(15), 'monitor')
    assert.equal(classifyDifferentialSettlement(40), 'action_required')
  })

  test('takes the worse of the two readings', () => {
    assert.equal(classifySettlement(0, 0), 'none')
    assert.equal(classifySettlement(0, 15), 'monitor')
    assert.equal(classifySettlement(5, 0), 'action_required')
    assert.equal(classifySettlement(0, 40), 'action_required')
    assert.equal(classifySettlement(null, null), 'none')
  })

  test('rejects negative measurements', () => {
    assert.throws(() => classifyTilt(-1), RangeError)
    assert.throws(() => classifyDifferentialSettlement(-5), RangeError)
  })
})

describe('Rebound hammer summary', () => {
  test('computes mean and indicative strength for consistent readings', () => {
    const summary = summarizeReadings([40, 41, 40, 42, 41])
    assert.equal(summary.readingsCount, 5)
    assert.equal(summary.outlierCount, 0)
    assert.equal(summary.meanRebound, 40.8)
    assert.ok(summary.estimatedStrengthMpa !== null)
    assert.ok(Math.abs((summary.estimatedStrengthMpa ?? 0) - (1.35 * 40.8 - 21.5)) < 0.01)
  })

  test('discards a wild reading', () => {
    const summary = summarizeReadings([40, 41, 40, 42, 41, 95])
    assert.equal(summary.outlierCount, 1)
    assert.ok(summary.outlierValues.includes(95))
    assert.equal(summary.keptValues.length, 5)
  })

  test('keeps everything when the spread carries no information', () => {
    const summary = summarizeReadings([40, 40, 40, 40])
    assert.equal(summary.outlierCount, 0)
    assert.equal(summary.meanRebound, 40)
  })

  test('never reduces to a single sample', () => {
    const summary = summarizeReadings([40, 41, 95])
    assert.ok(summary.keptValues.length >= 2)
  })

  test('rejects implausible readings', () => {
    assert.throws(() => rejectOutliers([5, 40, 41]), RangeError)
    assert.throws(() => rejectOutliers([40, 140]), RangeError)
  })

  test('empty input yields a null summary rather than NaN', () => {
    const summary = summarizeReadings([])
    assert.equal(summary.meanRebound, null)
    assert.equal(summary.estimatedStrengthMpa, null)
  })
})
