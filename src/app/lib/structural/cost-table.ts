import type { DamageType, SeverityLevel, StructuralElement } from '@/app/types'

/**
 * Planning-level repair cost table, in PHP.
 *
 * This is a documented formula, not an estimate of certainty. It exists so the
 * AI's cost range has something deterministic to be checked against, per the
 * agreed scope contract (§3 A6). The numbers are capstone planning values,
 * labelled as such wherever they surface in the UI.
 */

export const COST_TABLE_VERSION = '2026.1'

/** Base repair cost in PHP by damage type and severity. */
export const BASE_REPAIR_COST_PHP: Record<DamageType, Record<SeverityLevel, number>> = {
  crack: { low: 3_000, medium: 12_000, high: 45_000, critical: 120_000 },
  corrosion: { low: 5_000, medium: 20_000, high: 70_000, critical: 180_000 },
  spalling: { low: 4_000, medium: 15_000, high: 55_000, critical: 150_000 },
  deformation: { low: 8_000, medium: 30_000, high: 100_000, critical: 250_000 },
  leakage: { low: 6_000, medium: 22_000, high: 80_000, critical: 200_000 },
  none: { low: 0, medium: 0, high: 0, critical: 0 },
}

/** Structural importance multiplier applied on top of the base cost. */
export const ELEMENT_MULTIPLIERS: Record<StructuralElement, number> = {
  column: 1.6,
  beam: 1.4,
  slab: 1.2,
  foundation: 1.8,
  wall: 1.1,
  facade: 1.0,
  roof: 1.05,
  general: 1.0,
  other: 1.0,
}

export interface CostRange {
  low: number
  likely: number
  high: number
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step
}

/** Deterministic planning estimate for one defect. */
export function tableEstimate(
  damageType: DamageType,
  severity: SeverityLevel,
  element: StructuralElement = 'general'
): number {
  const base = BASE_REPAIR_COST_PHP[damageType][severity]
  if (base === 0) return 0

  const multiplier = ELEMENT_MULTIPLIERS[element] ?? 1
  return roundToNearest(base * multiplier, 500)
}

/**
 * The deterministic band shown beside the AI range: ±40% around the likely value.
 * Kept deliberately wider than typical contractor variation so that a normal AI
 * answer does not trip the divergence flag.
 */
export function tableRange(likelyPhp: number): CostRange {
  if (likelyPhp <= 0) return { low: 0, likely: 0, high: 0 }

  return {
    low: roundToNearest(likelyPhp * 0.6, 500),
    likely: likelyPhp,
    high: roundToNearest(likelyPhp * 1.4, 500),
  }
}

export interface DivergenceResult {
  divergent: boolean
  ratio: number | null
  reason: string
}

/**
 * Compare the AI's likely figure against the table.
 *
 * The AI is allowed to disagree — a heritage facade genuinely costs more than a
 * generic slab — but the disagreement must be visible and confirmed by an
 * engineer rather than silently signed into a report.
 */
export function checkDivergence(
  aiLikelyPhp: number | null | undefined,
  tableLikelyPhp: number,
  options: { lowFactor?: number; highFactor?: number } = {}
): DivergenceResult {
  const lowFactor = options.lowFactor ?? 0.5
  const highFactor = options.highFactor ?? 2

  if (aiLikelyPhp == null || !Number.isFinite(aiLikelyPhp)) {
    return { divergent: false, ratio: null, reason: 'No AI estimate to compare.' }
  }

  if (tableLikelyPhp <= 0) {
    return {
      divergent: aiLikelyPhp > 0,
      ratio: null,
      reason:
        aiLikelyPhp > 0
          ? 'The table has no planning cost for this defect, but the AI proposed a figure.'
          : 'Neither source produced a cost.',
    }
  }

  const ratio = aiLikelyPhp / tableLikelyPhp

  if (ratio < lowFactor || ratio > highFactor) {
    return {
      divergent: true,
      ratio,
      reason: `AI estimate is ${ratio.toFixed(2)}× the table value, outside the accepted ${lowFactor}×–${highFactor}× band.`,
    }
  }

  return {
    divergent: false,
    ratio,
    reason: `AI estimate is ${ratio.toFixed(2)}× the table value, within the accepted band.`,
  }
}

export function formatPhp(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value)
}
