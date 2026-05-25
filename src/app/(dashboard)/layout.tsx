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
      <div className="p-4 lg:p-8">
        <RealtimeSync />
        {children}
      </div>
    </NavWrapper>
  )
}
