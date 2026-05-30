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
      <div className="bg-white p-8 rounded-[2rem] shadow-lg space-y-6">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Account Profile</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Identity and professional details.</p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Full name</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Official Email</label>
            <input
              value={profile?.email || 'N/A'}
              disabled
              className="w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-400 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Contact Number</label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-1.5 ml-1">Primary Department</label>
            <input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Access Tier: <span className="text-accent">{profile?.role ?? 'viewer'}</span>
          </div>
          <Button 
            type="button" 
            onClick={handleSave} 
            disabled={updateProfile.isPending}
            className="font-black uppercase tracking-widest text-xs px-6"
          >
            {updateProfile.isPending ? 'Syncing...' : 'Save Profile'}
          </Button>
        </div>
        {error && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
        {success && <p className="text-xs font-bold text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">{success}</p>}
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-lg space-y-6">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Preferences</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Alert and notification settings.</p>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group cursor-pointer hover:border-primary/30 transition-colors">
            <span className="text-xs font-black text-slate-700 uppercase tracking-tight">Real-time risk alerts</span>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(event) => setNotificationsEnabled(event.target.checked)}
              className="h-5 w-5 accent-primary rounded-lg"
            />
          </label>
          <label className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group cursor-pointer hover:border-primary/30 transition-colors">
            <span className="text-xs font-black text-slate-700 uppercase tracking-tight">Weekly compliance digest</span>
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(event) => setDigestEnabled(event.target.checked)}
              className="h-5 w-5 accent-primary rounded-lg"
            />
          </label>
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
            Settings currently stored in local buffer.
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2rem] shadow-lg space-y-6 lg:col-span-2">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Data Management</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current system health and record metrics.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Monitoring</div>
            <div className="text-xs font-black text-emerald-600 uppercase tracking-tight">
              {activeProject?.status === 'active' ? 'Active' : activeProject?.status ?? 'N/A'}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Risk</div>
            <div className={`text-xs font-black uppercase tracking-tight ${zoneRiskLevel.color.split(' ')[1]}`}>
              {zoneRiskLevel.label}
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Zones</div>
            <div className="text-xs font-black text-black uppercase tracking-tight">
              {zones?.length || 0} Records
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Environmental</div>
            <div className="text-xs font-black text-emerald-600 uppercase tracking-tight">Verified</div>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <Button 
            type="button" 
            variant="outline" 
            className="font-black uppercase tracking-widest text-xs px-6 border-slate-200" 
            onClick={() => window.print()}
          >
            Export Audit Snapshot
          </Button>
        </div>
      </div>
    </div>
  )
}
