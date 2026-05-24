'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/app/lib/supabase/client'

export function RealtimeSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inspections' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inspections'] })
        queryClient.invalidateQueries({ queryKey: ['stats'] })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reports' }, () => {
        queryClient.invalidateQueries({ queryKey: ['reports'] })
        queryClient.invalidateQueries({ queryKey: ['stats'] })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'maintenance_priorities' }, () => {
        queryClient.invalidateQueries({ queryKey: ['maintenance'] })
        queryClient.invalidateQueries({ queryKey: ['stats'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return null
}
