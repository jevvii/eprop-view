import { SettingsCards } from '@/components/settings/settings-cards'
import { CreateInspectorForm } from '@/components/settings/create-inspector-form'
import { UserList } from '@/components/settings/user-list'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-500">Manage profile details, inspector accounts, and system status.</p>
      </div>
      
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CreateInspectorForm />
        <UserList />
      </div>
      <SettingsCards />
    </div>
  )
}
