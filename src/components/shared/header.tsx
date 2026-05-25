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
  }
  const currentPage = pageTitles[pathname] ?? 'Dashboard'

  return (
    <header className="flex items-center justify-between px-4 lg:px-8 py-4 lg:py-5 bg-white border-b border-slate-200/50 shadow-sm sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Mobile Menu Button */}
        <button 
          onClick={toggle}
          className="lg:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
          aria-label="Toggle Menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <span className="font-bold text-slate-900 text-sm lg:text-base">{currentPage}</span>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="hidden sm:block text-right">
          <div className="text-xs font-bold text-slate-900 leading-tight">{profile?.full_name}</div>
          <div className="text-[10px] text-slate-500 font-medium">{email}</div>
        </div>
        <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-black text-xs lg:text-sm shadow-inner">
          {initial}
        </div>
      </div>
    </header>
  )
}
