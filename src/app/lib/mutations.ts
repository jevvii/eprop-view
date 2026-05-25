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
