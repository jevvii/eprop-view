/**
 * Preview-only switch for the project-trained crack detector.
 *
 * The flag defaults off. It is refused on production deployments even if the
 * variable is set, so enabling it cannot change the production route.
 */
export function trainedCrackDetectorEnabled(): boolean {
  if (process.env.TRAINED_CRACK_DETECTOR?.trim().toLowerCase() !== 'on') return false
  if (process.env.VERCEL_ENV === 'production') return false
  return true
}

/** Exposed for the analysis UI so it can explain why the trained path ran. */
export function trainedCrackDetectorFlagState(): 'on' | 'off' | 'blocked-production' {
  if (process.env.TRAINED_CRACK_DETECTOR?.trim().toLowerCase() !== 'on') return 'off'
  return process.env.VERCEL_ENV === 'production' ? 'blocked-production' : 'on'
}
