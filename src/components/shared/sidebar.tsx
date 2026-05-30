'use client'

import Link from 'next/link'
import Image from 'next/image'
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
      fixed inset-y-0 left-0 z-50 w-64 bg-primary 
      flex flex-col p-4 border-r border-white/10 transition-transform duration-300 ease-in-out
      lg:relative lg:translate-x-0
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      <div className="flex items-center justify-between mb-8 px-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 relative">
            <Image 
              src="/logo.png" 
              alt="EPROP VIEW Logo" 
              fill
              className="object-contain"
            />
          </div>
          <span className="text-white font-koulen text-xl tracking-wider leading-none pt-1">EPROP VIEW</span>
        </div>
        
        {/* Mobile Close Button */}
        <button 
          onClick={close}
          className="lg:hidden p-2 text-white/60 hover:text-white"
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
                  ? 'bg-white text-primary shadow-lg shadow-black/10'
                  : 'text-white/80 hover:bg-white/10 border-transparent'
              }`}
            >
              <span className="text-base" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={() => logout()}
          className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:translate-y-[-1px] transition-transform active:scale-[0.98] shadow-lg shadow-black/10"
        >
          Log Out
        </button>
      </div>
    </aside>
  )
}
