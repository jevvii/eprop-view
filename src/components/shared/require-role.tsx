'use client'

import React from 'react'
import Link from 'next/link'
import { useProfile } from '@/app/lib/queries'
import { hasCapability, type Capability } from '@/app/lib/role-utils'
import type { Role } from '@/app/types'

interface RequireCapabilityProps {
  capability: Capability
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequireCapability({ capability, children, fallback = null }: RequireCapabilityProps) {
  const { data: profile, isLoading } = useProfile()
  if (isLoading) return null
  if (!profile || !hasCapability(profile.role, capability)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}

interface RequireRoleProps {
  allowed: Role[] | Role
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function RequireRole({ allowed, children, fallback = null }: RequireRoleProps) {
  const { data: profile, isLoading } = useProfile()
  if (isLoading) return null
  const list = Array.isArray(allowed) ? allowed : [allowed]
  if (!profile || !list.includes(profile.role)) {
    return <>{fallback}</>
  }
  return <>{children}</>
}

interface AccessDeniedProps {
  title?: string
  message?: string
  returnHref?: string
  returnLabel?: string
}

export function AccessDenied({
  title = 'Access Restricted',
  message = 'Your user role does not have authorization to view this operational module.',
  returnHref,
  returnLabel = 'Return to Navigation',
}: AccessDeniedProps) {
  const { data: profile } = useProfile()
  const defaultHref = profile?.role === 'inspector' ? '/document' : '/dashboard'
  const targetHref = returnHref || defaultHref

  return (
    <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 text-center max-w-lg mx-auto my-8 sm:my-12 space-y-6">
      <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-inner">
        🔒
      </div>
      <div>
        <h3 className="text-xl font-koulen text-primary tracking-wide uppercase">{title}</h3>
        <p className="text-xs sm:text-sm font-medium text-slate-600 mt-2 leading-relaxed">
          {message}
        </p>
        {profile && (
          <div className="mt-4 inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Role:</span>
            <span className="text-xs font-bold text-primary uppercase tracking-wider">{profile.role}</span>
          </div>
        )}
      </div>
      <div>
        <Link
          href={targetHref}
          className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold uppercase tracking-wider px-6 py-3 rounded-xl hover:bg-primary/90 transition-all shadow-md shadow-primary/20 min-h-[44px]"
        >
          {returnLabel}
        </Link>
      </div>
    </div>
  )
}
