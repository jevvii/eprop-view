'use client'

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-brand-gray">
      <div className="w-full max-w-md bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-500 border border-red-100 flex items-center justify-center mx-auto text-3xl">
          ⚠️
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-koulen tracking-wider text-black uppercase">Application Error</h1>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
            The requested view encountered a temporary runtime interruption.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button
            onClick={() => reset()}
            className="w-full text-[9px] font-black uppercase tracking-[0.2em] py-3.5 h-auto"
          >
            Retry Connection
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              window.location.replace('/')
            }}
            className="w-full text-[9px] font-black uppercase tracking-[0.2em] py-3.5 h-auto"
          >
            Return to Login
          </Button>
        </div>
      </div>
    </div>
  )
}
