'use client'

import { useEffect, useMemo, useState } from 'react'
import { useGeospatialZones, useInspections, useProfile, useProjects, useReports } from '@/app/lib/queries'
import { useUpdateProfile } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'

export function SettingsCards() {
  const { data: profile, isLoading, isError } = useProfile()
  const { data: reports } = useReports()
  const { data: inspections } = useInspections()
  const { data: projects } = useProjects()
  const { data: zones } = useGeospatialZones()
  const updateProfile = useUpdateProfile()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [digestEnabled, setDigestEnabled] = useState(false)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setPhone(profile.phone ?? '')
    setDepartment(profile.department ?? '')
  }, [profile])

  const activeProject = useMemo(() => {
    if (!projects || projects.length === 0) return null
    return projects.find((project) => project.status === 'active') ?? projects[0]
  }, [projects])

  const zoneRiskLevel = useMemo(() => {
    if (!zones || zones.length === 0) return { label: 'Low', color: 'bg-emerald-100 text-emerald-700' }
    const hasZoneA = zones.some((zone) => zone.risk_level === 'zone_a')
    const hasZoneB = zones.some((zone) => zone.risk_level === 'zone_b')
    if (hasZoneA) return { label: 'Critical', color: 'bg-red-100 text-red-700' }
    if (hasZoneB) return { label: 'Moderate', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Low', color: 'bg-emerald-100 text-emerald-700' }
  }, [zones])

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    try {
      await updateProfile.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim(),
        department: department.trim(),
      })
      setSuccess('Profile updated successfully.')
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Failed to update profile.')
    }
  }

  if (isLoading) {
    return <div className="bg-white p-6 rounded-2xl shadow-lg h-48 animate-pulse" />
  }

  if (isError) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-lg text-red-600">
        Failed to load settings
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-wide">ACCOUNT PROFILE</h3>
          <p className="text-xs text-slate-500">Manage your inspector profile details.</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Full name</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
            <input
              value={profile?.email || 'N/A'}
              disabled
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Phone</label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Department</label>
            <input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="text-xs text-slate-500">Role: {profile?.role ?? 'viewer'}</div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={updateProfile.isPending}>
            Save Profile
          </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-wide">NOTIFICATIONS</h3>
          <p className="text-xs text-slate-500">Configure alert preferences for risk updates.</p>
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <label className="flex items-center justify-between gap-3">
            <span>Real-time risk alerts</span>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(event) => setNotificationsEnabled(event.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Weekly compliance digest</span>
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(event) => setDigestEnabled(event.target.checked)}
              className="h-4 w-4 accent-blue-600"
            />
          </label>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Notification settings are stored locally for now. Connect a notification service to persist them.
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-wide">SYSTEM INFO</h3>
          <p className="text-xs text-slate-500">Environment and service configuration.</p>
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>Supabase Status</span>
            <span className="text-emerald-600 font-semibold">Connected</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Realtime Sync</span>
            <span className="text-emerald-600 font-semibold">Enabled</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last Sign-in</span>
            <span>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Total Reports</span>
            <span>{reports?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Total Inspections</span>
            <span>{inspections?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Active Project</span>
            <span>{activeProject?.name ?? 'N/A'}</span>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 tracking-wide">DATA MANAGEMENT</h3>
          <p className="text-xs text-slate-500">Snapshot of active monitoring data.</p>
        </div>
        <div className="space-y-3 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>Project Status</span>
            <span className="text-emerald-600 font-semibold">
              {activeProject?.status === 'active' ? 'Active Monitoring' : activeProject?.status ?? 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Risk Level</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${zoneRiskLevel.color}`}>
              {zoneRiskLevel.label}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Geospatial Zones</span>
            <span>{zones ? `${zones.length} zone${zones.length !== 1 ? 's' : ''}` : '0 zones'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Environmental Record</span>
            <span className="text-emerald-600 font-semibold">On File</span>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print Reports
          </Button>
        </div>
      </div>
    </div>
  )
}
