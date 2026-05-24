import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/app/lib/supabase/middleware'

function copyHeaders(from: Response, to: NextResponse): NextResponse {
  from.headers.forEach((value, key) => {
    if (key === 'set-cookie') {
      to.headers.append('set-cookie', value)
    } else {
      to.headers.set(key, value)
    }
  })
  return to
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)

  const path = request.nextUrl.pathname
  const isProtectedRoute = path.startsWith('/dashboard') || path.startsWith('/api')
  const isAuthRoute = path === '/login' || path === '/signup'

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    return copyHeaders(supabaseResponse, redirectResponse)
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && user) {
    const redirectUrl = new URL('/dashboard', request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    return copyHeaders(supabaseResponse, redirectResponse)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
