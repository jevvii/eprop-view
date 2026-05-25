'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { useProfile } from '@/app/lib/queries'
import { useNav } from './nav-wrapper'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/projects', label: 'Projects', icon: '📁' },
  { href: '/environmental', label: 'Environmental View', icon: '🌍' },
  { href: '/reports', label: 'Reports', icon: '📋' },
  { href: '/document', label: 'Document', icon: '📄' },
  { href: '/settings', label: 'Settings', icon: '⚙️', adminOnly: true },
]

export function Sidebar() {
  const pathname = usePathname()
  const { data: profile } = useProfile()
  const { isOpen, close } = useNav()
  const isAdmin = profile?.role === 'admin'

  return (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-64 bg-gradient-to-b from-slate-800 to-slate-900 
      flex flex-col p-4 border-r border-slate-700/20 transition-transform duration-300 ease-in-out
      lg:relative lg:translate-x-0
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      <div className="flex items-center justify-between mb-8 px-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-800 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 40 40" className="w-5 h-5" fill="none">
              <rect width="40" height="40" rx="8" fill="#1e40af"/>
              <path d="M10 20h20M20 10v20M10 10l20 20M30 10L10 30" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <span className="text-slate-200 font-extrabold text-sm tracking-wider">EPROP VIEW</span>
        </div>
        
        {/* Mobile Close Button */}
        <button 
          onClick={close}
          className="lg:hidden p-2 text-slate-400 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (window.innerWidth < 1024) close()
              }}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                pathname === item.href
                  ? 'bg-blue-600 text-white border-l-4 border-blue-300 shadow-lg shadow-blue-900/20'
                  : 'text-slate-300 hover:bg-slate-700/40 border-l-4 border-transparent'
              }`}
            >
              <span className="text-base" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="pt-4 border-t border-slate-700/30">
        <button
          type="button"
          onClick={() => logout()}
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold rounded-xl hover:translate-y-[-1px] transition-transform active:scale-[0.98] shadow-lg shadow-indigo-900/20"
        >
          Log Out
        </button>
      </div>
    </aside>
  )
}
