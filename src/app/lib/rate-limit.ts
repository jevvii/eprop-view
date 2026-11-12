import 'server-only'
import { createServiceClient } from './supabase/service'

/**
 * Shared-store rate limiter backed by the `consume_rate_limit` RPC.
 *
 * Only the server's service role may choose keys and budgets. Anonymous login
 * attempts must use this same shared store before an authenticated session exists.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  options: { failClosed?: boolean } = {}
): Promise<void> {
  if (!key || key.length > 256 || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
    throw new Error('Invalid rate limit configuration')
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    console.error('Rate limiter unavailable:', error.message)
    if (options.failClosed !== false) throw new Error('RATE_LIMIT_UNAVAILABLE')
    return
  }

  if (data === false) {
    throw new Error('RATE_LIMITED')
  }
}
