import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { runMigration } from '@/app/lib/migrate'

export const runtime = 'nodejs'

export async function POST() {
  // Auth check outside try/catch to avoid catching redirect errors
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const result = await runMigration()

  if (!result.success) {
    return NextResponse.json(result, { status: 500 })
  }

  return NextResponse.json(result)
}
