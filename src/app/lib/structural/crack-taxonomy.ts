import type {
  CrackCause,
  CrackOrientation,
  CrackPattern,
  CrackWidthBand,
  ConcreteExposure,
} from '@/app/types'

/**
 * Crack taxonomy.
 *
 * Width bands and tolerances follow ACI 224R-01 ("Control of Cracking in
 * Concrete Structures"), §4.1. Cause categories follow ACI 201.1R ("Guide for
 * Conducting a Visual Inspection of Concrete in Service"). NSCP 2015 is
 * ACI-derived, which is why this is the reference used rather than Eurocode.
 *
 * Everything here is a documented lookup, not a model. The AI may propose a
 * width; this module decides which band it falls in.
 */

/** ACI 224R-01 §4.1 recommended tolerable crack widths at first exposure, in mm. */
export const ACI_224R_EXPOSURE_LIMITS_MM: Record<ConcreteExposure, number> = {
  dry_air: 0.1,
  humid: 0.15,
  deicing_chemicals: 0.18,
  water_retaining: 0.3,
}

export const EXPOSURE_LABELS: Record<ConcreteExposure, string> = {
  dry_air: 'Dry air or protective membrane',
  humid: 'Humid air, moist ground',
  deicing_chemicals: 'Deicing chemicals',
  water_retaining: 'Water-retaining structures, seawater',
}

interface BandDefinition {
  band: CrackWidthBand
  /** Exclusive lower bound in mm. */
  minExclusive: number
  /** Inclusive upper bound in mm; null means unbounded. */
  maxInclusive: number | null
  label: string
}

export const CRACK_WIDTH_BANDS: BandDefinition[] = [
  { band: 'hairline', minExclusive: 0, maxInclusive: 0.1, label: 'Hairline (< 0.10 mm)' },
  { band: 'fine', minExclusive: 0.1, maxInclusive: 0.3, label: 'Fine (0.10 – 0.30 mm)' },
  { band: 'medium', minExclusive: 0.3, maxInclusive: 1.0, label: 'Medium (0.30 – 1.00 mm)' },
  { band: 'wide', minExclusive: 1.0, maxInclusive: 2.0, label: 'Wide (1.00 – 2.00 mm)' },
  { band: 'severe', minExclusive: 2.0, maxInclusive: null, label: 'Severe (> 2.00 mm)' },
]

export const ORIENTATION_LABELS: Record<CrackOrientation, string> = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  diagonal: 'Diagonal',
  stepped: 'Stepped (following masonry joints)',
  map_cracking: 'Map / crazing pattern',
  none: 'Not applicable',
}

export const PATTERN_LABELS: Record<CrackPattern, string> = {
  single: 'Single crack',
  multiple: 'Multiple cracks',
  parallel: 'Parallel cracks',
  random: 'Random / irregular',
  none: 'Not applicable',
}

export const CAUSE_LABELS: Record<CrackCause, string> = {
  settlement: 'Foundation settlement',
  shrinkage: 'Shrinkage',
  thermal: 'Thermal movement',
  overload: 'Overload / structural distress',
  corrosion_induced: 'Corrosion-induced (reinforcement expansion)',
  unknown: 'Undetermined',
  none: 'Not applicable',
}

function assertNonNegative(value: number, field: string): void {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative number`)
  }
}

/** Classify a measured crack width into its ACI 224R band. */
export function classifyCrackWidth(widthMm: number): CrackWidthBand {
  assertNonNegative(widthMm, 'Crack width')

  for (const definition of CRACK_WIDTH_BANDS) {
    if (widthMm <= (definition.maxInclusive ?? Number.POSITIVE_INFINITY)) {
      return definition.band
    }
  }

  return 'severe'
}

/** True when the measured width exceeds the ACI 224R tolerance for that exposure. */
export function exceedsAciLimit(widthMm: number, exposure: ConcreteExposure): boolean {
  assertNonNegative(widthMm, 'Crack width')
  return widthMm > ACI_224R_EXPOSURE_LIMITS_MM[exposure]
}

export function describeCrackWidthBand(band: CrackWidthBand): string {
  return CRACK_WIDTH_BANDS.find((definition) => definition.band === band)?.label ?? band
}

export interface CrackAssessment {
  band: CrackWidthBand
  bandLabel: string
  exceedsAciLimit: boolean
  aciLimitMm: number
  exposure: ConcreteExposure
  reference: string
}

/**
 * Full assessment for display. The reference string is stored alongside the
 * record so a reader can always trace which rule produced the verdict.
 */
export function assessCrack(
  widthMm: number,
  exposure: ConcreteExposure = 'humid'
): CrackAssessment {
  const band = classifyCrackWidth(widthMm)
  const aciLimitMm = ACI_224R_EXPOSURE_LIMITS_MM[exposure]

  return {
    band,
    bandLabel: describeCrackWidthBand(band),
    exceedsAciLimit: exceedsAciLimit(widthMm, exposure),
    aciLimitMm,
    exposure,
    reference: `ACI 224R-01 §4.1 (${EXPOSURE_LABELS[exposure]}; limit ${aciLimitMm.toFixed(2)} mm)`,
  }
}
