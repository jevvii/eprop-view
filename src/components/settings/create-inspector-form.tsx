'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createInspector } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'

type CreateInspectorFormProps = {
  onClose?: () => void
}

export function CreateInspectorForm({ onClose }: CreateInspectorFormProps) {
  const [state, action, pending] = useActionState(createInspector, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
      if (onClose) {
        setTimeout(onClose, 1500)
      }
    }
  }, [state, onClose])

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-900 mb-1">Add New Inspector</h3>
        <p className="text-sm text-slate-500">Create a new account with inspector-level permissions.</p>
      </div>

      <form ref={formRef} action={action} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="fullName" className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Full Name</label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Doe"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="inspector@eprop.local"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Initial Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Min. 8 characters"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {state?.error && (
          <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
            {state.error}
          </div>
        )}
        
        {state?.success && (
          <div className="bg-emerald-50 border border-emerald-100 text-emerald-600 px-4 py-3 rounded-xl text-sm font-medium">
            {state.message}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          {onClose && (
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}
          <button
            type="submit"
            disabled={pending}
            className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {pending ? 'Creating...' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  )
}
