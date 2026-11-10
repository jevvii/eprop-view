import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'
import type { Role } from '@/app/types'

/**
 * Session + profile resolution.
 *
 * The profile row is the ONLY source of truth for role. JWT user_metadata is
 * user-writable and must never authorize anything. A missing profile and a
 * deactivated profile are both treated as "no access".
 */
export const verifySession = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    console.error('Profile lookup failed:', profileError.message)
    redirect('/?error=profile-unavailable')
  }

  if (!profile) {
    redirect('/?error=profile-missing')
  }

  if (profile.is_active === false) {
    await supabase.auth.signOut()
    redirect('/?error=account-deactivated')
  }

  return {
    userId: user.id,
    role: profile.role as Role,
    email: user.email ?? '',
  }
})

export async function requireRole(allowed: Role[] | Role): Promise<{ userId: string; role: Role; email: string }> {
  const session = await verifySession()
  const list = Array.isArray(allowed) ? allowed : [allowed]
  if (!list.includes(session.role)) {
    throw new Error(`Access denied: role '${session.role}' is not in allowed roles (${list.join(', ')})`)
  }
  return session
}

export async function requireCapabilityCheck(capability: import('./role-utils').Capability): Promise<{ userId: string; role: Role; email: string }> {
  const session = await verifySession()
  const { requireCapability } = await import('./role-utils')
  requireCapability(session.role, capability)
  return session
}
