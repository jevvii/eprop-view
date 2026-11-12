'use client'

import { useProfile } from '@/app/lib/queries'
import { useNav } from './nav-wrapper'
import { usePathname } from 'next/navigation'

export function Header() {
  const { data: profile } = useProfile()
  const { toggle } = useNav()
  const pathname = usePathname()
  
  const email = profile?.email ?? ''
  const initial = profile?.full_name?.[0]?.toUpperCase() ?? email[0]?.toUpperCase() ?? 'U'

  // Map pathname to readable title
  const pageTitles: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/projects': 'Projects',
    '/environmental': 'Environmental View',
    '/reports': 'Reports',
    '/document': 'Documents',
    '/settings': 'Settings',
    '/ar': 'AR Inspection',
  }
  const currentPage = pageTitles[pathname] ?? 'Dashboard'

  const role = profile?.role ?? 'viewer'
  const roleBadgeStyles: Record<string, string> = {
    admin: 'bg-primary/10 text-primary border-primary/20',
    engineer: 'bg-blue-50 text-blue-800 border-blue-200',
    inspector: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    viewer: 'bg-slate-100 text-slate-700 border-slate-200',
  }
  const roleBadgeClass = roleBadgeStyles[role] ?? roleBadgeStyles.viewer
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1)

  return (
    <header className="flex items-center justify-between gap-2 px-4 lg:px-8 pt-[max(0.875rem,env(safe-area-inset-top))] pb-3.5 lg:py-5 bg-white border-b border-slate-200/50 sticky top-0 z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Mobile Menu Button - 44x44px touch target */}
        <button
          onClick={toggle}
          className="lg:hidden shrink-0 min-w-11 min-h-11 flex items-center justify-center p-2.5 -ml-2 text-primary hover:bg-slate-100 rounded-xl transition-colors"
          aria-label="Open navigation menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <h1 className="font-koulen text-primary text-lg sm:text-xl lg:text-2xl tracking-wide uppercase leading-none pt-1 truncate min-w-0">
          {currentPage}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Role badge is redundant on the narrowest screens; the avatar remains. */}
        <span
 className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${roleBadgeClass}`}
        >
          {roleLabel}
        </span>

        <div className="hidden sm:block text-right">
          <div className="text-xs font-black text-slate-900 leading-tight">{profile?.full_name || 'Authorized User'}</div>
          <div className="text-xs text-slate-500 font-medium truncate max-w-[180px]">{email}</div>
        </div>
        <div 
          className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-primary flex items-center justify-center text-white font-black text-xs lg:text-sm"
          aria-hidden="true"
        >
          {initial}
        </div>
      </div>
    </header>
  )
}
