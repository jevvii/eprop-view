'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from './supabase/client'
import type { Report, Inspection, EnvironmentalRisk } from '@/app/types'

const supabase = createClient()

export function useCreateInspection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inspection: Omit<Inspection, 'id' | 'created_at' | 'updated_at' | 'risk_level'>) => {
      const { data, error } = await supabase.from('inspections').insert(inspection).select().single()
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
    mutationFn: async (report: Omit<Report, 'id' | 'report_id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase.rpc('create_report_with_id', { report_data: report })
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
    mutationFn: async ({ id, ...updates }: Partial<EnvironmentalRisk> & { id: string }) => {
      const { data, error } = await supabase.from('environmental_risks').update(updates).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['environmental-risk', variables.project_id] })
    },
  })
}
