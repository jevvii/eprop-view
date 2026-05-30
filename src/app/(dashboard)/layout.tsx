import React from 'react'
import { Header } from '@/components/shared/header'
import { RealtimeSync } from '@/components/dashboard/realtime-sync'
import { NavWrapper } from '@/components/shared/nav-wrapper'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <NavWrapper>
      <Header />
      <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        <RealtimeSync />
        {children}
      </div>
    </NavWrapper>
  )
}
