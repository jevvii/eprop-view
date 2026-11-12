import type { SettlementClassification } from '@/app/types'

/**
 * Tilt and differential settlement classification.
 *
 * Thresholds are project-defined screening thresholds, not AI output or a
 * universal code acceptance limit. A domain engineer must assess site context. The inspector
 * enters a measurement; this module decides the label and states which
 * threshold produced it.
 *
 * Tilt is expressed as mm of horizontal deviation per metre of height, which is
 * equivalent to 1/n × 1000. The configured screening ratios are 1/500 for "monitor" and 1/250 for "action required".
 */

export const TILT_THRESHOLDS_MM_PER_M = {
  /** 1/500 — the point at which movement should be tracked over repeat visits. */
  monitor: 2,
  /** 1/250 — the point at which structural assessment is warranted. */
  action: 4,
} as const

export const DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM = {
  /** Project monitoring threshold; not a universally applicable limit. */
  monitor: 10,
  /** Project trigger for an engineer to investigate, not a failure prediction. */
  action: 25,
} as const

const SEVERITY_ORDER: SettlementClassification[] = ['none', 'monitor', 'action_required']

function worst(a: SettlementClassification, b: SettlementClassification): SettlementClassification {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b
}

function assertNonNegative(value: number, field: string): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative number`)
  }
}

export function classifyTilt(tiltMmPerM: number): SettlementClassification {
  assertNonNegative(tiltMmPerM, 'Tilt')
  if (tiltMmPerM > TILT_THRESHOLDS_MM_PER_M.action) return 'action_required'
  if (tiltMmPerM > TILT_THRESHOLDS_MM_PER_M.monitor) return 'monitor'
  return 'none'
}

export function classifyDifferentialSettlement(settlementMm: number): SettlementClassification {
  assertNonNegative(settlementMm, 'Differential settlement')
  if (settlementMm > DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.action) return 'action_required'
  if (settlementMm > DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.monitor) return 'monitor'
  return 'none'
}

/**
 * Combined classification: the worse of the two readings. A building that is
 * not tilting but is settling differentially is still a concern.
 */
export function classifySettlement(
  tiltMmPerM: number | null | undefined,
  differentialSettlementMm: number | null | undefined
): SettlementClassification {
  const tilt = tiltMmPerM == null ? 'none' : classifyTilt(tiltMmPerM)
  const settlement =
    differentialSettlementMm == null ? 'none' : classifyDifferentialSettlement(differentialSettlementMm)

  return worst(tilt, settlement)
}

export interface SettlementExplanation {
  classification: SettlementClassification
  tiltClassification: SettlementClassification
  settlementClassification: SettlementClassification
  reasons: string[]
}

export function explainSettlement(
  tiltMmPerM: number | null | undefined,
  differentialSettlementMm: number | null | undefined
): SettlementExplanation {
  const reasons: string[] = []

  const tiltClassification =
    tiltMmPerM == null ? 'none' : classifyTilt(tiltMmPerM)
  if (tiltMmPerM != null) {
    reasons.push(
      `Tilt ${tiltMmPerM.toFixed(2)} mm/m (≈1/${Math.round(1000 / Math.max(tiltMmPerM, 0.001))}): ` +
        `monitor above ${TILT_THRESHOLDS_MM_PER_M.monitor} mm/m, action above ${TILT_THRESHOLDS_MM_PER_M.action} mm/m.`
    )
  }

  const settlementClassification =
    differentialSettlementMm == null ? 'none' : classifyDifferentialSettlement(differentialSettlementMm)
  if (differentialSettlementMm != null) {
    reasons.push(
      `Differential settlement ${differentialSettlementMm.toFixed(1)} mm: ` +
        `monitor above ${DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.monitor} mm, ` +
        `action above ${DIFFERENTIAL_SETTLEMENT_THRESHOLDS_MM.action} mm.`
    )
  }

  if (reasons.length === 0) {
    reasons.push('No measurements recorded, so no movement can be classified.')
  }

  return {
    classification: worst(tiltClassification, settlementClassification),
    tiltClassification,
    settlementClassification,
    reasons,
  }
}

export const SETTLEMENT_LABELS: Record<SettlementClassification, string> = {
  none: 'No movement requiring action',
  monitor: 'Monitor — re-measure on the next visit',
  action_required: 'Action required — structural assessment',
}
