'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from './supabase/client'
import type { Report, Inspection, EnvironmentalRisk } from '@/app/types'

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
