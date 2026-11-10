import type { ReboundImpactDirection } from '@/app/types'

/**
 * Rebound hammer (Schmidt hammer) summary.
 *
 * The instrument reading is a rebound number (R), not a strength. Converting R
 * to an in-situ strength needs a calibration curve specific to the hammer, the
 * concrete, and the direction of impact. We use a documented indicative linear
 * correlation and label it as such everywhere it appears — this is the honest
 * capstone position, not a laboratory result.
 */

export const REBOUND_CORRELATION_REFERENCE =
  'Indicative linear correlation f′c ≈ 1.35R − 21.5 MPa (requires site-specific calibration)'

const REBOUND_MIN = 10
const REBOUND_MAX = 100

/** Direction correction factors are documented but small; recorded for traceability. */
export const IMPACT_DIRECTION_LABELS: Record<ReboundImpactDirection, string> = {
  horizontal: 'Horizontal impact',
  upward: 'Upward impact (soffit)',
  downward: 'Downward impact (top surface)',
  any: 'Mixed / not recorded',
}

function assertReading(value: number): void {
  if (!Number.isFinite(value) || value < REBOUND_MIN || value > REBOUND_MAX) {
    throw new RangeError(
      `Rebound reading ${value} is outside the plausible range (${REBOUND_MIN}–${REBOUND_MAX}).`
    )
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function quartile(sortedValues: number[], q: number): number {
  const position = (sortedValues.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedValues[lower]
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (position - lower)
}

export interface OutlierResult {
  kept: number[]
  outliers: number[]
}

/**
 * Reject readings that sit outside median ± 1.5 × IQR.
 *
 * When the IQR is zero (every reading identical) nothing is rejected, because
 * the spread carries no information. At least two readings must survive; if the
 * rule would discard everything but one, the rule is abandoned rather than
 * silently producing a single-sample "mean".
 */
export function rejectOutliers(values: number[]): OutlierResult {
  if (values.length === 0) return { kept: [], outliers: [] }
  values.forEach(assertReading)

  if (values.length < 4) return { kept: [...values], outliers: [] }

  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quartile(sorted, 0.25)
  const q3 = quartile(sorted, 0.75)
  const iqr = q3 - q1

  if (iqr === 0) return { kept: [...values], outliers: [] }

  const lowerFence = q1 - 1.5 * iqr
  const upperFence = q3 + 1.5 * iqr

  const kept: number[] = []
  const outliers: number[] = []
  for (const value of values) {
    if (value < lowerFence || value > upperFence) outliers.push(value)
    else kept.push(value)
  }

  if (kept.length < 2) return { kept: [...values], outliers: [] }

  return { kept, outliers }
}

export interface ReboundSummary {
  readingsCount: number
  outlierCount: number
  meanRebound: number | null
  correctedRebound: number | null
  estimatedStrengthMpa: number | null
  correlationReference: string
  keptValues: number[]
  outlierValues: number[]
}

/**
 * Summarise a set of readings.
 *
 * `correctedRebound` is currently identical to the mean: no direction correction
 * is applied because the correction table is instrument-specific and inventing
 * one would be worse than omitting it. The field exists so a calibrated
 * correction can be added without a schema change.
 */
export function summarizeReadings(values: number[]): ReboundSummary {
  if (values.length === 0) {
    return {
      readingsCount: 0,
      outlierCount: 0,
      meanRebound: null,
      correctedRebound: null,
      estimatedStrengthMpa: null,
      correlationReference: REBOUND_CORRELATION_REFERENCE,
      keptValues: [],
      outlierValues: [],
    }
  }

  const { kept, outliers } = rejectOutliers(values)
  const mean = kept.reduce((total, value) => total + value, 0) / kept.length
  const meanRounded = Number(mean.toFixed(2))
  const strength = Math.max(0, 1.35 * mean - 21.5)

  return {
    readingsCount: values.length,
    outlierCount: outliers.length,
    meanRebound: meanRounded,
    correctedRebound: meanRounded,
    estimatedStrengthMpa: Number(strength.toFixed(2)),
    correlationReference: REBOUND_CORRELATION_REFERENCE,
    keptValues: kept,
    outlierValues: outliers,
  }
}
