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

  const handleSave = async () => {
    setError(null)
    setSuccess(null)
    try {
      await updateProfile.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim(),
        department: department.trim(),
      })
      setSuccess('Profile updated.')
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
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {/* 1. Account Profile */}
      <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 space-y-6 lg:col-span-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-xs font-bold text-slate-600 tracking-wider uppercase mb-1">Account Profile</h3>
            <p className="text-xs text-slate-500 font-medium">Identity and credentials.</p>
          </div>
          <div className="text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-50 px-3.5 py-1.5 rounded-full border border-slate-200 self-start sm:self-auto">
            Access Tier: <span className="text-primary font-bold uppercase">{profile?.role ?? 'VIEWER'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="settings-full-name">Full Designation</label>
            <input id="settings-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base sm:text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="settings-email">Secure Email</label>
            <input id="settings-email"
              value={profile?.email || 'SYSTEM_NODE'}
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base sm:text-sm font-medium text-slate-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="settings-phone">Contact Protocol</label>
            <input id="settings-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base sm:text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="settings-department">Assigned Department</label>
            <input id="settings-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-base sm:text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button 
            type="button" 
            onClick={handleSave} 
            disabled={updateProfile.isPending}
            className="font-bold uppercase tracking-wider text-xs px-6 py-2.5 min-h-[44px] shadow-lg shadow-primary/20"
          >
            {updateProfile.isPending ? 'Syncing...' : 'Update Records'}
          </Button>
        </div>
        {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 mt-4">{error}</p>}
        {success && <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100 mt-4">{success}</p>}
      </div>

      {/* 3. AI Model Management (Admin Section) */}
      {isAdmin && (
        <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 space-y-6 lg:col-span-2 xl:col-span-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <h3 className="text-xs font-bold text-slate-600 tracking-wider uppercase mb-1">
                Analysis Method Registry
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Select and configure registered analysis methods. This does not deploy or train model weights.
              </p>
            </div>
            <button
              onClick={() => setIsRegisterModelOpen(true)}
              className="text-xs font-bold uppercase tracking-wider bg-primary text-white px-4 py-2.5 min-h-[40px] rounded-xl shadow-md hover:bg-primary/90 transition-all self-start sm:self-auto"
            >
              + Register Analysis Method
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="responsive-table w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 font-bold text-xs text-slate-600 uppercase tracking-wider pl-2">Model Name & Task</th>
                  <th className="text-left py-3 font-bold text-xs text-slate-600 uppercase tracking-wider">Version</th>
                  <th className="text-left py-3 font-bold text-xs text-slate-600 uppercase tracking-wider">Format</th>
                  <th className="text-left py-3 font-bold text-xs text-slate-600 uppercase tracking-wider">Target Labels</th>
                  <th className="text-right py-3 font-bold text-xs text-slate-600 uppercase tracking-wider pr-2">Registry Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aiModels?.map((model) => (
                  <tr key={model.id} className="hover:bg-slate-50/70 transition-all">
                    <td className="py-4 pl-2">
                      <div className="font-bold text-slate-900 tracking-tight">{model.name}</div>
                      <div className="text-xs text-slate-500 font-semibold uppercase">{model.task}</div>
                    </td>
                    <td className="py-4 text-xs font-semibold text-slate-700 tabular-nums">v{model.version}</td>
                    <td className="py-4">
                      <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold uppercase">
                        {model.format}
                      </span>
                    </td>
                    <td className="py-4 text-xs font-medium text-slate-600 max-w-xs truncate">
                      {model.labels.join(', ')}
                    </td>
                    <td className="py-4 text-right pr-2">
                      <button
                        onClick={() => handleToggleModel(model.id, model.is_active)}
                        className={`text-xs font-bold uppercase tracking-wider px-3.5 py-2 min-h-[36px] rounded-xl transition-all border ${
                          model.is_active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
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

      {/* 4. Storage & system health */}
      <div className="bg-white p-5 sm:p-6 lg:p-8 rounded-2xl shadow-sm border border-slate-200/70 space-y-6 lg:col-span-2 xl:col-span-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Storage and layers</h3>
            <p className="text-xs text-slate-500 font-medium">
              Geohazard layers currently loaded. Storage objects are managed below.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Geohazard layers</div>
            <div className="text-sm font-bold uppercase tracking-tight text-slate-900">
              <span className="tabular-nums">{zones?.length || 0}</span> layers
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Faults, liquefaction and flood zones</div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Inspection bucket</div>
            <div className="text-sm font-bold uppercase tracking-tight text-slate-900">inspection-images</div>
            <div className="text-xs text-slate-500 mt-1 font-medium">Private, signed URLs, 10 MB cap</div>
          </div>
        </div>
      </div>

      {/* Modal for Registering New AI Model */}
      {isRegisterModelOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 sm:p-6 backdrop-blur-sm">
          <form
            onSubmit={handleRegisterModel}
            className="w-full max-w-lg rounded-2xl sm:rounded-3xl bg-white p-5 sm:p-8 shadow-2xl space-y-5 max-h-[90dvh] overflow-y-auto overscroll-contain"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold uppercase tracking-wider text-slate-800">
                  Register Analysis Method
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Register neural network weights
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterModelOpen(false)}
                aria-label="Close modal"
                className="w-11 h-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 font-bold transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Model Identifier / Name
                </label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. Edge-Gradient Heuristic"
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Version
                  </label>
                  <input
                    type="text"
                    value={modelVersion}
                    onChange={(e) => setModelVersion(e.target.value)}
                    placeholder="1.0.0"
                    className="w-full text-base sm:text-sm font-medium tabular-nums bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Task
                  </label>
                  <select
                    value={modelTask}
                    onChange={(e) => setModelTask(e.target.value as AIModelTask)}
                    className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="detection">Detection</option>
                    <option value="classification">Classification</option>
                    <option value="segmentation">Segmentation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Format
                  </label>
                  <select
                    value={modelFormat}
                    onChange={(e) => setModelFormat(e.target.value as AIModelFormat)}
                    className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="onnx">ONNX</option>
                    <option value="tfjs">TFJS</option>
                    <option value="heuristic">Heuristic (non-ML)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Target Defect Labels (Comma separated)
                </label>
                <input
                  type="text"
                  value={modelLabels}
                  onChange={(e) => setModelLabels(e.target.value)}
                  className="w-full text-base sm:text-sm font-medium bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRegisterModelOpen(false)}
                className="text-xs font-bold uppercase min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={registerAIModel.isPending}
                className="text-xs font-bold uppercase bg-primary text-white min-h-[44px]"
              >
                {registerAIModel.isPending ? 'Saving…' : 'Register method'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
