'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { logout } from '@/app/actions/auth'
import { createClient } from '@/app/lib/supabase/client'
import { useProfile, useUnreadAssetNotifications } from '@/app/lib/queries'
import { useNav } from './nav-wrapper'

export function Sidebar() {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { data: profile } = useProfile()
  const { data: unreadCount } = useUnreadAssetNotifications()
  const { isOpen, close } = useNav()
  const isAdmin = profile?.role === 'admin'

  // Close drawer on Escape key when open on mobile
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, close])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      queryClient.clear()
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Logout error:', err)
    } finally {
      window.location.replace('/')
    }
  }

  const userRole = profile?.role || 'viewer'

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊', roles: ['admin', 'engineer'] },
    { href: '/projects', label: 'Projects', icon: '📁', roles: ['admin', 'engineer', 'inspector'] },
    { href: '/environmental', label: 'Environmental View', icon: '🌍', roles: ['admin', 'engineer'] },
    { href: '/reports', label: 'Reports', icon: '📋', roles: ['admin', 'engineer'] },
    {
      href: '/document',
      label: 'Document',
      icon: '📄',
      badge: unreadCount && unreadCount > 0 ? unreadCount : null,
      roles: ['admin', 'engineer', 'inspector'],
    },
    { href: '/ar', label: 'AR Mode', icon: '🥽', roles: ['inspector', 'admin'] },
    { href: '/settings', label: 'Settings', icon: '⚙️', roles: ['admin'] },
  ]

  const visibleNavItems = navItems.filter((item) => item.roles.includes(userRole))

  return (
    <aside 
      className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white overscroll-contain
        flex flex-col p-6 border-r border-slate-100 transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}
      aria-label="Main Navigation Drawer"
    >
      <div className="flex items-center justify-between mb-8 sm:mb-12 px-2">
        <div className="flex items-center gap-3.5">
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
        
        {/* Mobile Close Button - 44x44px accessible hit target */}
        <button 
          onClick={close}
          className="lg:hidden min-w-11 min-h-11 flex items-center justify-center p-2 text-slate-500 hover:text-black hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close navigation menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <nav className="flex-1 flex flex-col gap-1.5" aria-label="Main Navigation">
        {visibleNavItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (window.innerWidth < 1024) close()
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex items-center justify-between px-4 py-3 rounded-xl text-xs font-black uppercase tracking-[0.08em] transition-all duration-200 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? 'bg-primary/10 text-primary border-l-4 border-primary font-black shadow-xs pl-3.5'
                  : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 border-l-4 border-transparent'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <span className={`text-base transition-transform ${isActive ? 'scale-110' : 'grayscale opacity-70'}`} aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="flex items-center justify-center min-w-5 h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-md shadow-red-200 tabular-nums">
                  {item.badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="pt-6 border-t border-slate-100">
        <button
          type="button"
          disabled={isLoggingOut}
          onClick={handleLogout}
          className="w-full min-h-[44px] py-3.5 bg-primary text-white font-black text-xs uppercase tracking-[0.18em] rounded-xl hover:translate-y-[-1px] transition-all active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </aside>
  )
}
