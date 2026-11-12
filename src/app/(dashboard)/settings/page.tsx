'use client'

import { ReportDialog } from '@/components/reports/report-dialog'

import { useState } from 'react'
import { SettingsCards } from '@/components/settings/settings-cards'
import { CreateInspectorForm } from '@/components/settings/create-inspector-form'
import { UserList } from '@/components/settings/user-list'
import { BuildingsManager } from '@/components/settings/buildings-manager'
import { FloorManager } from '@/components/settings/floor-manager'
import { StructuralElementManager } from '@/components/settings/structural-element-manager'
import { GeohazardLayerManager } from '@/components/settings/geohazard-layer-manager'
import { StorageManager } from '@/components/settings/storage-manager'
import { AuditLog } from '@/components/settings/audit-log'
import { SystemHealth } from '@/components/settings/system-health'
import { ProjectManager } from '@/components/settings/project-manager'
import { BackupRestore } from '@/components/settings/backup-restore'
import { ConfigurationPanel } from '@/components/settings/configuration-panel'
import { DemoDataPanel } from '@/components/settings/demo-data'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { useProfile } from '@/app/lib/queries'

type SettingsTab = 'overview' | 'users' | 'buildings' | 'geohazard' | 'storage' | 'projects' | 'audit' | 'health' | 'backup' | 'config' | 'demo'

const TABS: { key: SettingsTab; label: string }[] = [
  { key: 'overview', label: 'Profile & telemetry' },
  { key: 'users', label: 'User directory' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'geohazard', label: 'Geohazard layers' },
  { key: 'storage', label: 'Storage lifecycle' },
  { key: 'projects', label: 'Projects' },
  { key: 'audit', label: 'Audit log' },
  { key: 'health', label: 'System health' },
  { key: 'backup', label: 'Export / import' },
  { key: 'config', label: 'Thresholds' },
  { key: 'demo', label: 'Demo data' },
]

export default function SettingsPage() {
  const { data: profile } = useProfile()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview')
  const isAdmin = profile?.role === 'admin'

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Governance & Settings"
        description={
          isAdmin
            ? 'Manage profiles, building hierarchies, geohazard datasets and storage retention.'
            : 'Manage profile details and telemetry settings.'
        }
        actions={
          isAdmin ? (
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="min-h-[44px] text-sm font-semibold"
            >
              Provision user
            </Button>
          ) : undefined
        }
      />

      {isAdmin && (
        <nav
          aria-label="Settings categories"
          className="no-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-left text-sm transition-colors ${
                activeTab === tab.key
                  ? 'border-primary font-semibold text-primary'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
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

      {isAdmin && activeTab === 'projects' && (
        <div className="grid grid-cols-1 gap-6">
          <ProjectManager />
        </div>
      )}

      {isAdmin && activeTab === 'audit' && (
        <div className="grid grid-cols-1 gap-6">
          <AuditLog />
        </div>
      )}

      {isAdmin && activeTab === 'health' && (
        <div className="grid grid-cols-1 gap-6">
          <SystemHealth />
        </div>
      )}

      {isAdmin && activeTab === 'backup' && (
        <div className="grid grid-cols-1 gap-6">
          <BackupRestore />
        </div>
      )}

      {isAdmin && activeTab === 'config' && (
        <div className="grid grid-cols-1 gap-6">
          <ConfigurationPanel />
        </div>
      )}

      {isAdmin && activeTab === 'demo' && (
        <div className="grid grid-cols-1 gap-6">
          <DemoDataPanel />
        </div>
      )}

      {isCreateModalOpen && (
        <ReportDialog title="Provision user" onClose={() => setIsCreateModalOpen(false)}>
            <CreateInspectorForm onClose={() => setIsCreateModalOpen(false)} />
        </ReportDialog>
      )}
    </div>
  )
}
