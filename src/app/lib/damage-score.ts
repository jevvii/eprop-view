import type { RiskLevel, SeverityLevel } from '@/app/types'

/**
 * Compute the final weighted damage score (0–10) based on Section 4 of the system spec:
 * Final Score = (Normalized AI Severity) * Structural Importance * Exposure Factor * Location Risk
 */
export function computeFinalDamageScore(
  aiSeverityScore: number,          // 0–100
  structuralImportance: number = 1.0, // 1.0–3.0 multiplier
  exposureFactor: number = 1.0,       // 0.5–2.0 multiplier
  locationRiskFactor: number = 1.0    // 0.5–2.0 multiplier
): number {
  const normalized = (Math.max(0, Math.min(100, aiSeverityScore)) / 100) * 10
  const weighted = normalized * structuralImportance * exposureFactor * locationRiskFactor
  return Math.min(10, Math.max(0, Number(weighted.toFixed(1))))
}

/**
 * Map a 0–10 numeric score to the standardized RiskLevel.
 */
export function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 8.0) return 'critical'
  if (score >= 6.0) return 'high'
  if (score >= 4.0) return 'moderate'
  return 'low'
}

/**
 * Map a severity level to a baseline 0–100 severity score.
 */
export function severityToScore(severity: SeverityLevel): number {
  switch (severity) {
    case 'critical':
      return 95
    case 'high':
      return 75
    case 'medium':
      return 50
    case 'low':
      return 25
  }
}
