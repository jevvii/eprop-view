import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

/**
 * Supabase email-confirmation callback. Exchanges the one-time code for a
 * session, then sends the user to the route their profile allows.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(new URL('/?error=confirmation-failed', url.origin))
    }
  }

  if (next && next.startsWith('/')) {
    return NextResponse.redirect(new URL(next, url.origin))
  }

  return NextResponse.redirect(new URL('/dashboard', url.origin))
}
