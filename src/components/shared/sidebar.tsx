'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  FileText,
  FolderKanban,
  Globe2,
  LayoutDashboard,
  ScanLine,
  Settings,
  UserCircle,
} from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { createClient } from '@/app/lib/supabase/client'
import { useProfile, useUnreadAssetNotifications } from '@/app/lib/queries'
import { useNav } from './nav-wrapper'
import { useMediaQuery } from './use-media-query'

export function Sidebar() {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const { data: profile } = useProfile()
  const { data: unreadCount } = useUnreadAssetNotifications()
  const { isOpen, close } = useNav()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
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
    { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard, roles: ['admin', 'engineer'] },
    { href: '/projects', label: 'Projects', Icon: FolderKanban, roles: ['admin', 'engineer', 'inspector'] },
    { href: '/environmental', label: 'Environmental View', Icon: Globe2, roles: ['admin', 'engineer'] },
    { href: '/reports', label: 'Reports', Icon: ClipboardList, roles: ['admin', 'engineer'] },
    {
      href: '/document',
      label: 'Documents',
      Icon: FileText,
      badge: unreadCount && unreadCount > 0 ? unreadCount : null,
      roles: ['admin', 'engineer', 'inspector'],
    },
    { href: '/ar', label: 'AR Inspection', Icon: ScanLine, roles: ['inspector', 'admin'] },
    { href: '/profile', label: 'My Profile', Icon: UserCircle, roles: ['admin', 'engineer', 'inspector', 'viewer'] },
    { href: '/settings', label: 'Settings', Icon: Settings, roles: ['admin'] },
  ]

  const visibleNavItems = navItems.filter((item) => item.roles.includes(userRole))

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white overscroll-contain
        flex flex-col p-6 border-r border-slate-100 transition-transform duration-300 ease-in-out
        overflow-y-auto
        pt-[max(1.5rem,env(safe-area-inset-top))]
        pb-[max(1.5rem,env(safe-area-inset-bottom))]
        lg:relative lg:translate-x-0
        ${isOpen ? 'translate-x-0 shadow-lg' : '-translate-x-full'}
      `}
      aria-label="Main navigation"
      /* Off-screen drawer must not remain in the tab order. */
      inert={!isDesktop && !isOpen}
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
              className={`group flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-[0.08em] transition-colors duration-150 min-h-[44px] border-l-4 ${
                isActive
                  ? 'bg-primary/10 text-primary border-primary'
                  : 'text-slate-700 hover:bg-slate-100/80 hover:text-slate-900 border-transparent'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <item.Icon
                  className={`w-5 h-5 shrink-0 ${isActive ? 'text-primary' : 'text-slate-500'}`}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
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
          className="w-full min-h-[44px] py-3.5 bg-primary text-white font-bold text-xs uppercase tracking-[0.18em] rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          {isLoggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </div>
    </aside>
  )
}
