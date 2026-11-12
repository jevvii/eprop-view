import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client.
 *
 * Bypasses RLS, so it may only be used in server code for operations that have
 * already authorised the caller by other means: sharing a report by an
 * unguessable token, or admin provisioning. Never import this from a client
 * component.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Service-role credentials are not configured.')
  }

  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
