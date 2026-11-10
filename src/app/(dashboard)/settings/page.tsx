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
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">System Governance & Settings</h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {isAdmin
              ? 'Manage profiles, master building hierarchies, geohazard datasets, and storage retention.'
              : 'Manage profile details and telemetry settings.'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setIsCreateModalOpen(true)} className="min-h-[44px] text-xs sm:text-sm font-semibold self-start md:self-auto">
            + Provision New User
          </Button>
        )}
      </div>

      {isAdmin && (
        <div role="tablist" aria-label="Settings Categories" className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 no-scrollbar overscroll-contain">
          <button
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-xl whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'overview' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            Profile & Telemetry
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-xl whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'users' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            User Directory
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'buildings'}
            onClick={() => setActiveTab('buildings')}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-xl whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'buildings' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            Building Master Data
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'geohazard'}
            onClick={() => setActiveTab('geohazard')}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-xl whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === 'geohazard' ? 'bg-primary text-white shadow-md' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            Geohazard Layers (GIS)
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'storage'}
            onClick={() => setActiveTab('storage')}
            className={`text-xs font-bold uppercase tracking-wider px-4 py-2.5 min-h-[44px] rounded-xl whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl sm:rounded-3xl bg-white p-5 sm:p-8 max-h-[90dvh] overflow-y-auto overscroll-contain shadow-2xl">
            <CreateInspectorForm onClose={() => setIsCreateModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
