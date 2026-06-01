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
      fixed inset-y-0 left-0 z-50 w-64 bg-white 
      flex flex-col p-6 border-r border-slate-100 transition-transform duration-300 ease-in-out
      lg:relative lg:translate-x-0
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      <div className="flex items-center justify-between mb-12 px-2">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 relative drop-shadow-sm">
            <Image 
              src="/logo-blue.png" 
              alt="EPROP VIEW Logo" 
              fill
              priority
              sizes="40px"
              className="object-contain" 
            />
            <div className="absolute inset-0 bg-primary/5 rounded-xl -z-10 scale-125" />
          </div>
          <span className="text-black font-koulen text-2xl tracking-wider leading-none pt-1">EPROP VIEW</span>
        </div>
        
        {/* Mobile Close Button */}
        <button 
          onClick={close}
          className="lg:hidden p-2 text-slate-400 hover:text-black"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 flex flex-col gap-2">
        {navItems.map((item) => {
          if (item.adminOnly && !isAdmin) return null
          
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (window.innerWidth < 1024) close()
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl text-xs font-black uppercase tracking-[0.1em] transition-all duration-200 ${
                isActive
                  ? 'bg-slate-50 text-primary shadow-sm ring-1 ring-slate-200/50'
                  : 'text-black hover:bg-slate-50 hover:text-primary'
              }`}
            >
              <span className={`text-base transition-transform ${isActive ? 'scale-110' : 'grayscale opacity-70'}`} aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="pt-6 border-t border-slate-100">
        <button
          type="button"
          onClick={() => logout()}
          className="w-full py-4 bg-primary text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:translate-y-[-1px] transition-all active:scale-[0.98] shadow-xl shadow-primary/20"
        >
          Logout
        </button>
      </div>
    </aside>
  )
}
