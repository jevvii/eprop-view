'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '@/app/actions/auth'
import { useProfile } from '@/app/lib/queries'

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
  const isAdmin = profile?.role === 'admin'

  return (
    <aside className="w-60 bg-gradient-to-b from-slate-800 to-slate-900 flex flex-col p-4 border-r border-slate-700/20">
      <div className="flex items-center gap-3 px-3 mb-8">
        <div className="w-9 h-9 bg-blue-800 rounded-lg flex items-center justify-center">
          <svg viewBox="0 0 40 40" className="w-5 h-5" fill="none">
            <rect width="40" height="40" rx="8" fill="#1e40af"/>
            <path d="M10 20h20M20 10v20M10 10l20 20M30 10L10 30" stroke="white" strokeWidth="2"/>
          </svg>
        </div>
        <span className="text-slate-200 font-extrabold text-sm tracking-wider">EPROP VIEW</span>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null
          
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                pathname === item.href
                  ? 'bg-blue-600 text-white border-l-4 border-blue-300'
                  : 'text-slate-300 hover:bg-slate-700/40 border-l-4 border-transparent'
              }`}
            >
              <span className="text-base" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        onClick={() => logout()}
        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-bold rounded-xl hover:translate-y-[-1px] transition-transform"
      >
        Log Out
      </button>
    </aside>
  )
}
