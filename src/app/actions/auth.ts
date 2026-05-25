'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/app/lib/supabase/server'
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

  const { error } = await supabase.auth.signInWithPassword({
    email: validated.data.email,
    password: validated.data.password,
  })

  if (error) {
    return { error: error.message }
  }

  // Check if account is active
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_active')
    .single()

  if (profile && profile.is_active === false) {
    await supabase.auth.signOut()
    return { error: 'Your account has been deactivated. Please contact an administrator.' }
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

  const { data, error } = await supabase.auth.signUp({
    email: validated.data.email,
    password: validated.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/callback`,
      data: {
        role: 'viewer',
      },
    },
  })

  if (error) {
    return { error: error.message }
  }

  if (data?.user) {
    const { error: insertError } = await supabase.from('profiles').insert({
      id: data.user.id,
      role: 'viewer',
    })
    if (insertError) {
      return { error: 'Account created but profile setup failed. Please contact support.' }
    }
  }

  revalidatePath('/', 'layout')
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
