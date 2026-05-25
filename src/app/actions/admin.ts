'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { z } from 'zod'

const createInspectorSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
})

export async function createInspector(prevState: unknown, formData: FormData) {
  const supabase = await createClient()

  // 1. Verify Admin Role
  const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !adminUser) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', adminUser.id)
    .single()

  if (profile?.role !== 'admin') return { error: 'Admin access required' }

  // 2. Validate Input
  const validated = createInspectorSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  })

  if (!validated.success) {
    const fieldErrors = validated.error.flatten().fieldErrors
    const firstError = Object.values(fieldErrors).flat()[0]
    return { error: firstError ?? 'Invalid form data' }
  }

  // 3. Create User with Admin Client (requires Service Role)
  // Note: createClient() for server usually uses anon key. 
  // We need a specific admin client for creating users without email confirmation if desired,
  // or we can use the regular sign up if we don't have a service role client ready.
  // Actually, for admin creating users, we SHOULD use the service role key.
  
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: validated.data.email,
    password: validated.data.password,
    email_confirm: true,
    user_metadata: { 
      role: 'inspector',
      full_name: validated.data.fullName
    },
  })

  if (error) return { error: error.message }

  if (data?.user) {
    const { error: insertError } = await supabaseAdmin.from('profiles').insert({
      id: data.user.id,
      role: 'inspector',
      full_name: validated.data.fullName
    })
    if (insertError) {
      return { error: 'User created but profile setup failed.' }
    }
  }

  revalidatePath('/settings')
  return { success: true, message: `Inspector account created for ${validated.data.email}` }
}

export async function toggleUserStatus(userId: string, currentStatus: boolean) {
  const supabase = await createClient()

  // 1. Verify Admin Role
  const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !adminUser) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', adminUser.id)
    .single()

  if (profile?.role !== 'admin') return { error: 'Admin access required' }

  // 2. Update Status
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: !currentStatus })
    .eq('id', userId)

  if (error) return { error: error.message }

  revalidatePath('/settings')
  return { success: true }
}

export async function getAllProfilesWithEmails() {
  const supabase = await createClient()

  // 1. Verify Admin Role
  const { data: { user: adminUser }, error: authError } = await supabase.auth.getUser()
  if (authError || !adminUser) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', adminUser.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Admin access required')

  // 2. Fetch using Admin Client
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profiles, error: pError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })
  if (pError) throw pError

  const { data: { users }, error: uError } = await supabaseAdmin.auth.admin.listUsers()
  if (uError) throw uError

  return (profiles || []).map((p) => ({
    ...p,
    email: users.find(u => u.id === p.id)?.email ?? '',
  }))
}
