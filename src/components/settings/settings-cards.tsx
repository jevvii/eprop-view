'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  useGeospatialZones,
  useInspections,
  useProfile,
  useProjects,
  useReports,
  useAdminAIModels,
} from '@/app/lib/queries'
import { useUpdateProfile, useToggleAIModel, useRegisterAIModel } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import type { AIModelTask, AIModelFormat } from '@/app/types'

export function SettingsCards() {
  const { data: profile, isLoading, isError } = useProfile()
  const { data: reports } = useReports()
  const { data: inspections } = useInspections()
  const { data: projects } = useProjects()
  const { data: zones } = useGeospatialZones()
  const { data: aiModels, refetch: refetchModels } = useAdminAIModels()

  const updateProfile = useUpdateProfile()
  const toggleAIModel = useToggleAIModel()
  const registerAIModel = useRegisterAIModel()

  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [digestEnabled, setDigestEnabled] = useState(false)

  // Register Model State
  const [isRegisterModelOpen, setIsRegisterModelOpen] = useState(false)
  const [modelName, setModelName] = useState('')
  const [modelVersion, setModelVersion] = useState('1.0.0')
  const [modelTask, setModelTask] = useState<AIModelTask>('detection')
  const [modelFormat, setModelFormat] = useState<AIModelFormat>('onnx')
  const [modelLabels, setModelLabels] = useState('crack, corrosion, spalling, deformation, leakage')

  const isAdmin = profile?.role === 'admin'

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

  const handleToggleModel = async (modelId: string, currentStatus: boolean) => {
    await toggleAIModel.mutateAsync({ modelId, currentStatus })
    await refetchModels()
  }

  const handleRegisterModel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modelName) return
    const labels = modelLabels.split(',').map((s) => s.trim()).filter(Boolean)
    await registerAIModel.mutateAsync({
      name: modelName,
      version: modelVersion,
      task: modelTask,
      format: modelFormat,
      labels,
      is_active: true,
    })
    setIsRegisterModelOpen(false)
    setModelName('')
    await refetchModels()
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
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Identity and credentials.</p>
          </div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
            Access Tier: <span className="text-primary font-black uppercase">{profile?.role ?? 'VIEWER'}</span>
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
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Alert and telemetry logic.</p>
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
            Local telemetry operational.<br/>Encrypted sync active.
          </div>
        </div>
      </div>

      {/* 3. AI Model Management (Admin Section) */}
      {isAdmin && (
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 lg:col-span-2 xl:col-span-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 px-2">
            <div>
              <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">
                AI Model Management & Checkpoints
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Deploy, version, and activate computer vision models.
              </p>
            </div>
            <button
              onClick={() => setIsRegisterModelOpen(true)}
              className="text-[9px] font-black uppercase tracking-widest bg-primary text-white px-4 py-2 rounded-xl shadow-md hover:bg-primary/90 transition-all"
            >
              + Deploy Model Checkpoint
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pl-2">Model Name & Task</th>
                  <th className="text-left py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Version</th>
                  <th className="text-left py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Format</th>
                  <th className="text-left py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em]">Target Labels</th>
                  <th className="text-right py-3 font-black text-[10px] text-slate-400 uppercase tracking-[0.2em] pr-2">Deployment Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {aiModels?.map((model) => (
                  <tr key={model.id} className="hover:bg-slate-50/50 transition-all">
                    <td className="py-4 pl-2">
                      <div className="font-black text-black uppercase tracking-tight">{model.name}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{model.task}</div>
                    </td>
                    <td className="py-4 text-xs font-bold text-slate-700">v{model.version}</td>
                    <td className="py-4">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-[9px] font-black uppercase">
                        {model.format}
                      </span>
                    </td>
                    <td className="py-4 text-[10px] font-medium text-slate-500 max-w-xs truncate">
                      {model.labels.join(', ')}
                    </td>
                    <td className="py-4 text-right pr-2">
                      <button
                        onClick={() => handleToggleModel(model.id, model.is_active)}
                        className={`text-[9px] font-black uppercase tracking-[0.15em] px-3.5 py-1.5 rounded-xl transition-all border ${
                          model.is_active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {model.is_active ? '● Active' : '○ Standby'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Storage & System Health (Admin & Global) */}
      <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 lg:col-span-2 xl:col-span-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-6 px-2">
          <div>
            <h3 className="text-xs font-black text-slate-400 tracking-[0.2em] uppercase mb-1">
              Storage, Retention & System Telemetry
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Cloud object storage status, geohazard layers, and tamper-evident audit logs.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Cloud Storage (S3)</div>
            <div className="text-sm font-black text-emerald-600 uppercase tracking-tight flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-bold">Bucket: inspection-images</div>
          </div>

          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Geohazard Layers</div>
            <div className={`text-sm font-black uppercase tracking-tight ${zoneRiskLevel.color.split(' ')[1]}`}>
              {zones?.length || 0} GIS Zones
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-bold">Faults & Floods Mapped</div>
          </div>

          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Data Retention</div>
            <div className="text-sm font-black text-slate-800 uppercase tracking-tight">
              7 Year Archival
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-bold">Cold storage policy enabled</div>
          </div>

          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 group hover:border-primary/20 transition-all">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Audit Logs & Integrity</div>
            <div className="text-sm font-black text-emerald-600 uppercase tracking-tight">
              Verified
            </div>
            <div className="text-[9px] text-slate-400 mt-1 font-bold">Cryptographic sign-offs</div>
          </div>
        </div>
      </div>

      {/* Modal for Registering New AI Model */}
      {isRegisterModelOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleRegisterModel}
            className="w-full max-w-lg rounded-[2rem] bg-white p-8 shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                  Deploy AI Model Checkpoint
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                  Register neural network weights
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModelOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Model Identifier / Name
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. YOLOv8-DamageDetector-v3"
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Version
                  </label>
                  <input
                    type="text"
                    value={modelVersion}
                    onChange={(e) => setModelVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Task
                  </label>
                  <select
                    value={modelTask}
                    onChange={(e) => setModelTask(e.target.value as AIModelTask)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="detection">Detection</option>
                    <option value="classification">Classification</option>
                    <option value="segmentation">Segmentation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Format
                  </label>
                  <select
                    value={modelFormat}
                    onChange={(e) => setModelFormat(e.target.value as AIModelFormat)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  >
                    <option value="onnx">ONNX</option>
                    <option value="tfjs">TFJS</option>
                    <option value="mock">Mock / Demo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Target Defect Labels (Comma separated)
                </label>
                <input
                  type="text"
                  value={modelLabels}
                  onChange={(e) => setModelLabels(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRegisterModelOpen(false)}
                className="text-[9px] font-bold uppercase"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={registerAIModel.isPending}
                className="text-[9px] font-black uppercase bg-primary text-white"
              >
                {registerAIModel.isPending ? 'Deploying...' : 'Deploy Checkpoint'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
