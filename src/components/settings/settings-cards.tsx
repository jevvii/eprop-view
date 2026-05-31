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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 xl:grid-cols-3">
      {/* 1. Account Profile */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 lg:col-span-2">
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 px-2">
          <div>
            <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Account Profile</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Identity and professional credentials.</p>
          </div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
            Access Tier: <span className="text-primary">{profile?.role ?? 'VIEWER'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-2 ml-1">Full Designation</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Secure Email</label>
            <input
              value={profile?.email || 'SYSTEM_NODE'}
              disabled
              className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-400 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-2 ml-1">Contact Protocol</label>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-primary uppercase tracking-widest mb-2 ml-1">Assigned Department</label>
            <input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button 
            type="button" 
            onClick={handleSave} 
            disabled={updateProfile.isPending}
            className="font-black uppercase tracking-[0.2em] text-[10px] px-10 py-5 h-auto shadow-lg shadow-primary/20"
          >
            {updateProfile.isPending ? 'Syncing...' : 'Update Records'}
          </Button>
        </div>
        {error && <p className="text-[10px] font-bold text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 mt-4">{error}</p>}
        {success && <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100 mt-4">{success}</p>}
      </div>

      {/* 2. Preferences */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8">
        <div>
          <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">Configuration</h3>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Alert and notification logic.</p>
        </div>
        <div className="space-y-4">
          <label className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 group cursor-pointer hover:border-primary/30 transition-all">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">Real-time alerts</span>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(event) => setNotificationsEnabled(event.target.checked)}
              className="h-5 w-5 accent-primary rounded-lg"
            />
          </label>
          <label className="flex items-center justify-between p-5 rounded-2xl bg-slate-50 border border-slate-100 group cursor-pointer hover:border-primary/30 transition-all">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-tight">System digest</span>
            <input
              type="checkbox"
              checked={digestEnabled}
              onChange={(event) => setDigestEnabled(event.target.checked)}
              className="h-5 w-5 accent-primary rounded-lg"
            />
          </label>
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/30 p-6 text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center leading-relaxed">
            Local state operational.<br/>Cloud sync disabled.
          </div>
        </div>
      </div>

      {/* 3. Data Management (Unified Full Width) */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 lg:col-span-2 xl:col-span-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 px-2">
          <div>
            <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">System Integrity</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current system health and metadata record status.</p>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            className="font-black uppercase tracking-[0.2em] text-[10px] px-8 border-slate-200" 
            onClick={() => window.print()}
          >
            Export Logs
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Monitoring</div>
            <div className="text-sm font-black text-emerald-600 uppercase tracking-tight flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {activeProject?.status === 'active' ? 'Active' : activeProject?.status ?? 'N/A'}
            </div>
          </div>
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Global Risk</div>
            <div className={`text-sm font-black uppercase tracking-tight ${zoneRiskLevel.color.split(' ')[1]}`}>
              {zoneRiskLevel.label}
            </div>
          </div>
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Sector Records</div>
            <div className="text-sm font-black text-black uppercase tracking-tight">
              {zones?.length || 0} Units
            </div>
          </div>
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Verification</div>
            <div className="text-sm font-black text-emerald-600 uppercase tracking-tight">Certified</div>
          </div>
        </div>
      </div>
    </div>
  )
}
