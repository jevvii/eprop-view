'use client'

import { useActionState } from 'react'
import { login } from '@/app/actions/auth'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)

  const hasError = !!state?.error

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
          required
          autoComplete="email"
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? 'login-error' : undefined}
          className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Enter your password"
          required
          autoComplete="current-password"
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? 'login-error' : undefined}
          className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>
      {state?.error && (
        <p id="login-error" role="alert" className="text-sm text-red-600 font-medium">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl hover:translate-y-[-1px] transition-transform disabled:opacity-50"
      >
        {pending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  )
}
