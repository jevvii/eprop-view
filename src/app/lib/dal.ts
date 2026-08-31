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
