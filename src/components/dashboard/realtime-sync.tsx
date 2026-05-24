'use client'

import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/app/lib/supabase/client'

export function RealtimeSync() {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => (typeof window !== 'undefined' ? createClient() : null), [])

  useEffect(() => {
    if (!supabase) return

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
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime sync channel error')
        } else if (status === 'TIMED_OUT') {
          console.warn('Realtime sync connection timed out')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, supabase])

  return null
}
