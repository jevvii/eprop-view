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
      <div className={`flex-1 flex flex-col min-h-0 relative ${isDashboard ? 'overflow-hidden' : 'overflow-y-auto print:overflow-visible'}`}>
        <RealtimeSync />
        <main className={`print:overflow-visible print:h-auto ${isDashboard ? 'h-full' : 'p-4 lg:p-8 space-y-6'}`}>
          {children}
        </main>
      </div>
    </NavWrapper>
  )
}
