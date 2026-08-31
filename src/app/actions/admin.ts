'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/app/lib/supabase/server'
import { z } from 'zod'
import type { Role, AIModel, AIModelFormat, AIModelTask } from '@/app/types'

const createUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  role: z.enum(['admin', 'engineer', 'inspector', 'viewer']).default('inspector'),
  department: z.string().optional().default('Engineering & Inspection'),
})

export async function createUser(prevState: unknown, formData: FormData) {
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
  const validated = createUserSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    role: formData.get('role') || 'inspector',
    department: formData.get('department') || 'Engineering & Inspection',
  })

  if (!validated.success) {
    const fieldErrors = validated.error.flatten().fieldErrors
    const firstError = Object.values(fieldErrors).flat()[0]
    return { error: firstError ?? 'Invalid form data' }
  }

  const { email, password, fullName, role, department } = validated.data

  // 3. Create User with Admin Client
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { 
      role,
      full_name: fullName
    },
  })

  if (error) return { error: error.message }

  if (data?.user) {
    const { error: insertError } = await supabaseAdmin.from('profiles').upsert({
      id: data.user.id,
      role,
      full_name: fullName,
      department,
      is_active: true
    })
    if (insertError) {
      return { error: 'User created in auth but profile setup failed: ' + insertError.message }
    }
  }

  revalidatePath('/settings')
  return { success: true, message: `${role.toUpperCase()} account created for ${email}` }
}

// Backward-compatible wrapper
export async function createInspector(prevState: unknown, formData: FormData) {
  return createUser(prevState, formData)
}

export async function updateUserRole(userId: string, newRole: Role) {
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

  // Prevent admin from accidentally demoting themselves if they are the only admin
  if (userId === adminUser.id && newRole !== 'admin') {
    return { error: 'Cannot remove admin role from your own active session.' }
  }

  // Update in profiles table
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId)

  if (error) return { error: error.message }

  // Sync to auth user_metadata
  try {
    const { createClient: createSupabaseClient } = await import('@supabase/supabase-js')
    const supabaseAdmin = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: { role: newRole }
    })
  } catch (syncErr) {
    console.warn('Metadata sync warning:', syncErr)
  }

  revalidatePath('/settings')
  return { success: true }
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

  if (userId === adminUser.id && currentStatus) {
    return { error: 'Cannot deactivate your own active session.' }
  }

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

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: { users }, error: uError } = await supabaseAdmin.auth.admin.listUsers()
  if (uError) throw uError

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]))

  return (users || []).map((u) => {
    const p = profileMap.get(u.id)
    return {
      id: u.id,
      email: u.email ?? '',
      full_name: p?.full_name || u.user_metadata?.full_name || u.email?.split('@')[0] || 'User',
      role: (p?.role || u.user_metadata?.role || 'viewer') as Role,
      department: p?.department || u.user_metadata?.department || 'Engineering & Inspection',
      phone: p?.phone || '',
      is_active: p?.is_active !== false,
      created_at: p?.created_at || u.created_at || new Date().toISOString(),
    }
  })
}

// AI Model Management (Admin)
export async function getAdminAIModels(): Promise<AIModel[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_models')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []) as AIModel[]
}

export async function toggleAIModelStatus(modelId: string, currentStatus: boolean) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { error: 'Admin access required' }

  const { error } = await supabase
    .from('ai_models')
    .update({ is_active: !currentStatus })
    .eq('id', modelId)

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

export async function registerAIModel(modelData: {
  name: string
  version: string
  task: AIModelTask
  format: AIModelFormat
  labels: string[]
  is_active?: boolean
}) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return { error: 'Admin access required' }

  const { data, error } = await supabase
    .from('ai_models')
    .insert({
      ...modelData,
      is_active: modelData.is_active ?? true,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true, model: data as AIModel }
}
