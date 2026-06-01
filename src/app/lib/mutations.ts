'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from './supabase/client'
import type { Report, Inspection, EnvironmentalRisk, Profile } from '@/app/types'

let client: ReturnType<typeof createClient> | null = null
function getClient() {
  if (!client) client = createClient()
  return client
}

export function useCreateInspection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inspection: Omit<Inspection, 'id' | 'created_at' | 'updated_at' | 'risk_level' | 'lead_inspector_id'>) => {
      const { data, error } = await getClient().from('inspections').insert(inspection).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useCreateReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (report: Omit<Report, 'id' | 'report_id' | 'created_at' | 'updated_at' | 'lead_inspector_id'>) => {
      const { data, error } = await getClient().rpc('create_report_with_id', { report_data: report })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useUpdateReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
      previousStatus,
    }: {
      id: string
      updates: Partial<Pick<Report, 'status' | 'risk_score' | 'key_findings'>>
      previousStatus?: Report['status']
    }) => {
      const { data: authData, error: authError } = await getClient().auth.getUser()
      if (authError || !authData.user) {
        throw authError ?? new Error('Not authenticated')
      }

      const now = new Date().toISOString()
      const payload: Record<string, unknown> = {
        ...updates,
        last_edited_by: authData.user.id,
        last_edited_at: now,
      }

      if (updates.status === 'completed' && previousStatus !== 'completed') {
        payload.reviewed_by = authData.user.id
        payload.reviewed_at = now
      }

      const { data, error } = await getClient()
        .from('reports')
        .update(payload)
        .eq('id', id)
        .select('id')
        .single()

      if (error && error.code === '42703') {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Reports audit columns missing. Apply migration 002_reports_audit_trail.sql.')
        }
        const { data: fallbackData, error: fallbackError } = await getClient()
          .from('reports')
          .update(updates)
          .eq('id', id)
          .select('id')
          .single()
        if (fallbackError) throw fallbackError
        return fallbackData
      }

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useUpdateEnvironmentalRisk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, project_id, ...updates }: Partial<EnvironmentalRisk> & { id: string; project_id: string }) => {
      void project_id
      const { data, error } = await getClient().from('environmental_risks').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['environmental-risk', variables.project_id] })
    },
  })
}

export function useUpsertEnvironmentalRisk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Partial<EnvironmentalRisk> & { project_id: string }) => {
      const { data, error } = await getClient()
        .from('environmental_risks')
        .upsert(payload, { onConflict: 'project_id' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['environmental-risk', variables.project_id] })
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      const { data: authData, error: authError } = await getClient().auth.getUser()
      if (authError || !authData.user) {
        throw authError ?? new Error('Not authenticated')
      }

      const { data, error } = await getClient()
        .from('profiles')
        .update(updates)
        .eq('id', authData.user.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
