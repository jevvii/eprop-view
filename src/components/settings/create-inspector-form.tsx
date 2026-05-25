'use client'

import { useActionState, useEffect, useRef } from 'react'
import { createInspector } from '@/app/actions/admin'

export function CreateInspectorForm() {
  const [state, action, pending] = useActionState(createInspector, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
      <h3 className="text-lg font-bold text-slate-900 mb-1">Add New Inspector</h3>
      <p className="text-sm text-slate-500 mb-6">Create a new account with inspector-level permissions.</p>

      <form ref={formRef} action={action} className="space-y-4 max-w-md">
        <div>
          <label htmlFor="fullName" className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
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
          <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
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
          <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1">Initial Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Min. 8 characters"
            required
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 font-medium bg-red-50 p-3 rounded-lg border border-red-100">{state.error}</p>
        )}
        
        {state?.success && (
          <p className="text-sm text-green-600 font-medium bg-green-50 p-3 rounded-lg border border-green-100">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {pending ? 'Creating...' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
