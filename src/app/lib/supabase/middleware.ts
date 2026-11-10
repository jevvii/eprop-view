import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session and resolves the caller's role from the
 * profiles table. Deactivated users are signed out here so a stale JWT cannot
 * keep a session alive.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user: authUser }, error } = await supabase.auth.getUser()

  if (error) {
    console.error('Auth error:', error.message)
  }

  let user = authUser
  let role: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (profile && profile.is_active === false) {
      await supabase.auth.signOut()
      user = null
    } else {
      role = (profile?.role as string | undefined) ?? 'viewer'
    }
  }

  return { supabase, supabaseResponse, user, role }
}
