import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export const verifySession = cache(async () => {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    console.error('Auth error:', error.message)
  }

  if (error || !user) {
    redirect('/')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const resolvedRole = (user.user_metadata?.role || profile?.role || user.app_metadata?.role || 'viewer') as import('@/app/types').Role

  return {
    userId: user.id,
    role: resolvedRole,
    email: user.email ?? '',
  }
})

export async function requireRole(allowed: import('@/app/types').Role[] | import('@/app/types').Role): Promise<{ userId: string; role: import('@/app/types').Role; email: string }> {
  const session = await verifySession()
  const list = Array.isArray(allowed) ? allowed : [allowed]
  if (!list.includes(session.role)) {
    throw new Error(`Access denied: role '${session.role}' is not in allowed roles (${list.join(', ')})`)
  }
  return session
}

export async function requireCapabilityCheck(capability: import('./role-utils').Capability): Promise<{ userId: string; role: import('@/app/types').Role; email: string }> {
  const session = await verifySession()
  const { requireCapability } = await import('./role-utils')
  requireCapability(session.role, capability)
  return session
}
