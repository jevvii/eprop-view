'use client'

import { useState } from 'react'
import { SettingsCards } from '@/components/settings/settings-cards'
import { CreateInspectorForm } from '@/components/settings/create-inspector-form'
import { UserList } from '@/components/settings/user-list'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/app/lib/queries'

export default function SettingsPage() {
  const { data: profile } = useProfile()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Settings</h2>
          <p className="text-slate-500">Manage profile details, inspector accounts, and system status.</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            Add New Inspector
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        {isAdmin && <UserList />}
        <SettingsCards />
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[2rem] bg-white p-10 shadow-2xl">
            <CreateInspectorForm onClose={() => setIsCreateModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
