import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/app/lib/supabase/middleware'

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value, cookie)
  })
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

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

  const role = (user?.app_metadata?.role || user?.user_metadata?.role || 'viewer') as string
  const homeRoute = role === 'inspector' ? '/document' : '/dashboard'

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/', request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && user) {
    const redirectUrl = new URL(homeRoute, request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    copyCookies(supabaseResponse, redirectResponse)
    return redirectResponse
  }

  // Redirect authenticated non-admins away from settings
  if (path.startsWith('/settings') && user) {
    if (role !== 'admin') {
      const redirectUrl = new URL(homeRoute, request.url)
      const redirectResponse = NextResponse.redirect(redirectUrl)
      copyCookies(supabaseResponse, redirectResponse)
      return redirectResponse
    }
  }

  // Redirect non-inspectors/non-admins away from AR mode
  if (path.startsWith('/ar') && user) {
    if (role !== 'inspector' && role !== 'admin') {
      const redirectUrl = new URL('/dashboard', request.url)
      const redirectResponse = NextResponse.redirect(redirectUrl)
      copyCookies(supabaseResponse, redirectResponse)
      return redirectResponse
    }
  }

  // Redirect inspectors away from engineer/admin exclusive modules
  if ((path.startsWith('/dashboard') || path.startsWith('/environmental') || path.startsWith('/reports')) && user) {
    if (role === 'inspector') {
      const redirectUrl = new URL('/document', request.url)
      const redirectResponse = NextResponse.redirect(redirectUrl)
      copyCookies(supabaseResponse, redirectResponse)
      return redirectResponse
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
