'use client'

import React from 'react'
import { Header } from '@/components/shared/header'
import { RealtimeSync } from '@/components/dashboard/realtime-sync'
import { NavWrapper } from '@/components/shared/nav-wrapper'
import { usePathname } from 'next/navigation'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isDashboard = pathname === '/dashboard'

  return (
    <NavWrapper>
      <Header />
      {/* The shell's <main> owns scrolling; nested overflow caused iOS
          scroll-chaining and unpredictable sticky behaviour. */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        <RealtimeSync />
        <div className={`print:overflow-visible print:h-auto ${isDashboard ? 'h-auto lg:h-full' : 'p-4 sm:p-6 lg:p-8 space-y-6'}`}>
          {children}
        </div>
      </div>
    </NavWrapper>
  )
}
