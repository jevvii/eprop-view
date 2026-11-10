import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/app/lib/supabase/middleware'

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie)
  })
}

/**
 * Next.js 16 proxy convention (replaces middleware.ts).
 * Routing guard only — authorization is enforced again in the DAL and in RLS.
 */
export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, role: profileRole } = await updateSession(request)

  const path = request.nextUrl.pathname
  const isProtectedRoute =
    path.startsWith('/dashboard') ||
    path.startsWith('/projects') ||
    path.startsWith('/environmental') ||
    path.startsWith('/reports') ||
    path.startsWith('/document') ||
    path.startsWith('/ar') ||
    path.startsWith('/settings')
  const isAuthRoute = path === '/' || path === '/login' || path === '/signup'

  // Role comes from profiles only. Never from user_metadata.
  const role = user ? (profileRole ?? 'viewer') : 'viewer'
  const homeRoute = role === 'inspector' ? '/document' : '/dashboard'

  if (isProtectedRoute && !user) {
    const redirectResponse = NextResponse.redirect(new URL('/', request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (isAuthRoute && user) {
    const redirectResponse = NextResponse.redirect(new URL(homeRoute, request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (path.startsWith('/settings') && user && role !== 'admin') {
    const redirectResponse = NextResponse.redirect(new URL(homeRoute, request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (path.startsWith('/ar') && user && role !== 'inspector' && role !== 'admin') {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (
    (path.startsWith('/dashboard') || path.startsWith('/environmental') || path.startsWith('/reports')) &&
    user &&
    role === 'inspector'
  ) {
    const redirectResponse = NextResponse.redirect(new URL('/document', request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
