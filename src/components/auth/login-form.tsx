'use client'

import { useActionState, useState } from 'react'
import { login } from '@/app/actions/auth'

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined)
  const [showPassword, setShowPassword] = useState(false)

  const hasError = !!state?.error

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="Enter your email"
          required
          autoComplete="email"
          aria-invalid={hasError ? 'true' : undefined}
          aria-describedby={hasError ? 'login-error' : undefined}
          className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            aria-invalid={hasError ? 'true' : undefined}
            aria-describedby={hasError ? 'login-error' : undefined}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary p-1"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {state?.error && (
        <p id="login-error" role="alert" className="text-sm text-red-600 font-medium bg-red-50 p-3 rounded-lg border border-red-100">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full py-3.5 bg-primary text-white font-black rounded-xl hover:translate-y-[-1px] transition-transform disabled:opacity-50 uppercase tracking-widest shadow-lg shadow-primary/20"
      >
        {pending ? 'Authorizing...' : 'Enter System'}
      </button>
    </form>
  )
}
