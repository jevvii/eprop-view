'use client'
import { AlertTriangle } from 'lucide-react'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application runtime error:', error)
  }, [error])

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 sm:p-6 bg-brand-gray">
      <div className="w-full max-w-md bg-white p-6 sm:p-8 rounded-lg sm:rounded-lg shadow-lg border border-slate-100 text-center space-y-6">
        <div className="w-16 h-16 rounded-lg bg-red-50 text-red-500 border border-red-100 flex items-center justify-center mx-auto">
          <AlertTriangle className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-koulen tracking-wider text-black uppercase">Application Error</h1>
          <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed">
            The requested view encountered a temporary runtime interruption.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-2">
          <Button
            onClick={() => reset()}
            className="w-full text-xs font-bold uppercase tracking-wider min-h-[44px]"
          >
            Retry Connection
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.replace('/')
            }}
            className="w-full text-xs font-bold uppercase tracking-wider min-h-[44px]"
          >
            Return to Login
          </Button>
        </div>
      </div>
    </div>
  )
}
