'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/app/lib/supabase/server'
import { enforceRateLimit } from '@/app/lib/rate-limit'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function login(prevState: unknown, formData: FormData) {
  const supabase = await createClient()

  const validated = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!validated.success) {
    const fieldErrors = validated.error.flatten().fieldErrors
    const firstError = Object.values(fieldErrors).flat()[0]
    return { error: firstError ?? 'Invalid form data' }
  }

  await enforceRateLimit(`login:${validated.data.email.toLowerCase()}`, 10, 900)

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  })

  if (error) {
    return { error: error.message }
  }

  if (authData?.user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active, role')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (!profile || profile.is_active === false) {
      await supabase.auth.signOut()
      return { error: 'Your account is inactive. Please contact an administrator.' }
    }

    // Role comes from profiles only. user_metadata is user-writable.
    const role = profile.role as string
    revalidatePath('/', 'layout')
    redirect(role === 'inspector' ? '/document' : '/dashboard')
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

export async function signup(prevState: unknown, formData: FormData) {
  const supabase = await createClient()

  const validated = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!validated.success) {
    const fieldErrors = validated.error.flatten().fieldErrors
    const firstError = Object.values(fieldErrors).flat()[0]
    return { error: firstError ?? 'Invalid form data' }
  }

  await enforceRateLimit(`signup:${validated.data.email.toLowerCase()}`, 5, 3600)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const { data, error } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  // The auth.users trigger creates the profile row as 'viewer'. Never insert it
  // here as well: a duplicate insert races the trigger and reports a false error.
  revalidatePath('/', 'layout')

  if (data?.session) {
    redirect('/dashboard')
  }

  redirect('/?message=Check your email to confirm your account')
}

export async function logout() {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    return { error: error.message }
  }
  revalidatePath('/', 'layout')
  redirect('/')
}
