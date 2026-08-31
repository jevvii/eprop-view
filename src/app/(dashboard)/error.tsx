'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function DashboardErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard runtime error:', error)
  }, [error])

  const handleReturnToLogin = () => {
    window.location.replace('/')
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6 bg-brand-gray">
      <div className="w-full max-w-md bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center mx-auto text-2xl">
          ⚠️
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-koulen tracking-wider text-slate-900 uppercase">Dashboard Telemetry Interrupted</h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
            An unexpected error occurred while synchronizing real-time dashboard data.
          </p>
          {error.message && (
            <p className="text-[9px] font-mono text-slate-400 bg-slate-50 p-2.5 rounded-xl border border-slate-100 break-words">
              {error.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-2">
          <Button
            onClick={() => reset()}
            className="w-full text-[9px] font-black uppercase tracking-[0.15em] py-3.5 h-auto truncate"
          >
            Reload Component
          </Button>
          <Button
            variant="outline"
            onClick={handleReturnToLogin}
            className="w-full text-[9px] font-black uppercase tracking-[0.15em] py-3.5 h-auto truncate"
          >
            Re-Authenticate
          </Button>
        </div>
      </div>
    </div>
  )
}
