'use client'

import { useState } from 'react'
import { SettingsCards } from '@/components/settings/settings-cards'
import { CreateInspectorForm } from '@/components/settings/create-inspector-form'
import { UserList } from '@/components/settings/user-list'
import { BuildingsManager } from '@/components/settings/buildings-manager'
import { FloorManager } from '@/components/settings/floor-manager'
import { StructuralElementManager } from '@/components/settings/structural-element-manager'
import { GeohazardLayerManager } from '@/components/settings/geohazard-layer-manager'
import { StorageManager } from '@/components/settings/storage-manager'
import { Button } from '@/components/ui/button'
import { useProfile } from '@/app/lib/queries'

type SettingsTab = 'overview' | 'users' | 'buildings' | 'geohazard' | 'storage'

export default function SettingsPage() {
  const { data: profile } = useProfile()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview')
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">System Governance & Settings</h2>
          <p className="text-slate-500">
            {isAdmin
              ? 'Manage profiles, master building hierarchies, geohazard datasets, and storage retention.'
              : 'Manage profile details and telemetry settings.'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsCreateModalOpen(true)}>
            + Provision New User
          </Button>
        )}
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab('overview')}
            className={`text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all ${
              activeTab === 'overview' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            Profile & Telemetry
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all ${
              activeTab === 'users' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            User Directory
          </button>
          <button
            onClick={() => setActiveTab('buildings')}
            className={`text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all ${
              activeTab === 'buildings' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            Building Master Data
          </button>
          <button
            onClick={() => setActiveTab('geohazard')}
            className={`text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all ${
              activeTab === 'geohazard' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            Geohazard Layers (GIS)
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl transition-all ${
              activeTab === 'storage' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            Storage & S3 Lifecycle
          </button>
        </div>
      )}

      {/* Tab Contents */}
      {(!isAdmin || activeTab === 'overview') && (
        <div className="grid grid-cols-1 gap-6">
          <SettingsCards />
        </div>
      )}

      {isAdmin && activeTab === 'users' && (
        <div className="grid grid-cols-1 gap-6">
          <UserList />
        </div>
      )}

      {isAdmin && activeTab === 'buildings' && (
        <div className="space-y-6">
          <BuildingsManager />
          <FloorManager />
          <StructuralElementManager />
        </div>
      )}

      {isAdmin && activeTab === 'geohazard' && (
        <div className="grid grid-cols-1 gap-6">
          <GeohazardLayerManager />
        </div>
      )}

      {isAdmin && activeTab === 'storage' && (
        <div className="grid grid-cols-1 gap-6">
          <StorageManager />
        </div>
      )}

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
