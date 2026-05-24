import React from 'react'
import { Sidebar } from '@/components/shared/sidebar'
import { Header } from '@/components/shared/header'
import { RealtimeSync } from '@/components/dashboard/realtime-sync'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-7 overflow-y-auto">
          <RealtimeSync />
          {children}
        </main>
      </div>
    </div>
  )
}
