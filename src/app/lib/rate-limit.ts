import 'server-only'
import { createClient } from './supabase/server'

/**
 * Shared-store rate limiter backed by the `consume_rate_limit` RPC.
 *
 * RLS is enabled on rate_limits with no policies, so only the SECURITY DEFINER
 * function can touch it. Keys are scoped by caller in the action.
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  options: { failClosed?: boolean } = {}
): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    console.error('Rate limiter unavailable:', error.message)
    if (options.failClosed) throw new Error('RATE_LIMIT_UNAVAILABLE')
    return
  }

  if (data === false) {
    throw new Error('RATE_LIMITED')
  }
}
