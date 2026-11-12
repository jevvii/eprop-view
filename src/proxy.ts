import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/app/lib/supabase/middleware'

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie)
  })
}

/**
 * Segment-aware path match.
 *
 * `path.startsWith('/ar')` also matches `/archive` and `/area`, which silently
 * applied the AR role guard to unrelated routes. A prefix only counts when it is
 * the whole segment.
 */
function isPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Next.js 16 proxy convention (replaces middleware.ts).
 * Routing guard only — authorization is enforced again in the DAL and in RLS.
 */
export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, role: profileRole } = await updateSession(request)

  const path = request.nextUrl.pathname
  const isProtectedRoute =
    isPath(path, '/dashboard') ||
    isPath(path, '/projects') ||
    isPath(path, '/environmental') ||
    isPath(path, '/reports') ||
    isPath(path, '/document') ||
    isPath(path, '/ar') ||
    isPath(path, '/profile') ||
    isPath(path, '/settings')
  const isAuthRoute = path === '/' || path === '/login' || path === '/signup'

  // Role comes from profiles only. Never from user_metadata.
  const role = user ? (profileRole ?? 'viewer') : 'viewer'
  const homeRoute = role === 'inspector' ? '/document' : role === 'viewer' ? '/reports' : '/dashboard'

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

  if (isPath(path, '/settings') && user && role !== 'admin') {
    const redirectResponse = NextResponse.redirect(new URL(homeRoute, request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (isPath(path, '/ar') && user && role !== 'inspector' && role !== 'admin') {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  // Viewers are read-only consumers of published reports. The operational
  // workspaces — asset vault, project registry — were previously reachable by
  // direct URL because only the sidebar hid them. RLS still protects the data,
  // but the surfaces themselves are not part of the viewer role.
  if (
    user &&
    role === 'viewer' &&
    (isPath(path, '/document') || isPath(path, '/projects'))
  ) {
    const redirectResponse = NextResponse.redirect(new URL('/reports', request.url))
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  if (
    (isPath(path, '/dashboard') || isPath(path, '/environmental') || isPath(path, '/reports')) &&
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
