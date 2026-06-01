'use client'

import { useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/app/lib/supabase/client'

export function RealtimeSync() {
  const queryClient = useQueryClient()
  const supabase = useMemo(() => (typeof window !== 'undefined' ? createClient() : null), [])
  const hasRealtimeConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  useEffect(() => {
    if (!supabase || !hasRealtimeConfig) return

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
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              'Realtime sync unavailable. Check Supabase realtime settings, table publication, and RLS policies.'
            )
          }
          supabase.removeChannel(channel)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, supabase, hasRealtimeConfig])

  return null
}
