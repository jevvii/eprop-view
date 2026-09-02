import type { DamageType, SeverityLevel, BoundingBox } from '@/app/types'

/**
 * Base severity weights per structural damage classification.
 * Derived from civil structural engineering failure impact standards.
 */
const BASE_DAMAGE_WEIGHTS: Record<DamageType, { baseScore: number; criticalThresholdArea: number }> = {
  spalling: { baseScore: 78, criticalThresholdArea: 0.04 }, // Spalling exposes core rebar, immediate structural integrity risk
  deformation: { baseScore: 65, criticalThresholdArea: 0.08 }, // Structural deflection / sagging / twist
  crack: { baseScore: 50, criticalThresholdArea: 0.05 }, // Tension / shear / shrinkage cracks
  corrosion: { baseScore: 42, criticalThresholdArea: 0.06 }, // Surface or deep rebar oxidation
  leakage: { baseScore: 35, criticalThresholdArea: 0.07 }, // Water intrusion, efflorescence
  none: { baseScore: 0, criticalThresholdArea: 1.0 },
}

/**
 * Maps calibrated numerical damage severity score (0 - 100) to standard categorical severity.
 */
export function scoreToSeverityLevel(score: number): SeverityLevel {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

/**
 * Computes a calibrated structural severity score (0 - 100) based on defect type,
 * bounding box surface area ratio, and model detection confidence.
 */
export function calculateDefectSeverity(
  damageType: DamageType,
  bbox: BoundingBox | null,
  confidence: number
): { severityScore: number; severity: SeverityLevel } {
  if (damageType === 'none') {
    return { severityScore: 0, severity: 'low' }
  }

  const { baseScore, criticalThresholdArea } = BASE_DAMAGE_WEIGHTS[damageType] ?? {
    baseScore: 40,
    criticalThresholdArea: 0.05,
  }

  // Calculate box area relative to image (0.0 to 1.0)
  const boxArea = bbox ? Math.max(0, Math.min(1, bbox.width * bbox.height)) : 0.03

  // Area impact factor: if defect covers significant proportion of the member, scale up
  const areaRatio = Math.min(2.0, boxArea / criticalThresholdArea)
  const areaMultiplier = 0.8 + areaRatio * 0.4

  // Confidence scaling: higher certainty yields firmer score assessment
  const confidenceFactor = 0.9 + Math.min(0.2, confidence * 0.2)

  // Aspect ratio penalty for cracks: elongated vertical/diagonal cracks indicate shear stress
  let aspectPenalty = 0
  if (damageType === 'crack' && bbox) {
    const ratio = Math.max(bbox.width / Math.max(0.01, bbox.height), bbox.height / Math.max(0.01, bbox.width))
    if (ratio > 3.0) aspectPenalty = 10 // Elongated continuous crack
  }

  const rawScore = baseScore * areaMultiplier * confidenceFactor + aspectPenalty
  const severityScore = Math.min(100, Math.max(5, Math.round(rawScore)))
  const severity = scoreToSeverityLevel(severityScore)

  return { severityScore, severity }
}
