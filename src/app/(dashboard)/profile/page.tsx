'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/app/lib/queries'
import { useUpdateProfile } from '@/app/lib/mutations'
import { Field, InlineMessage, Panel, inputClass } from '@/components/structural/ui'

/**
 * Profile self-service.
 *
 * Every role can reach this page. Inspectors and engineers previously had no
 * way to edit their own details because `/settings` is admin-only, which left
 * the "Manage Profile" use case unmet for two of the three actors.
 */
export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setPhone(profile.phone ?? '')
    setDepartment(profile.department ?? '')
  }, [profile])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    try {
      await updateProfile.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim(),
        department: department.trim(),
      })
      setSuccess('Profile updated.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to update the profile.')
    }
  }

  if (isLoading) {
    return <div className="h-64 rounded-3xl bg-white border border-slate-100 animate-pulse" />
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">My Profile</h2>
        <p className="text-xs text-slate-500 font-medium tracking-wide mt-0.5">
          Your contact details as they appear on inspections and reports.
        </p>
      </div>

      <Panel title="Account Details" description={`Signed in as ${profile?.email ?? 'unknown'}. Role: ${profile?.role ?? 'unknown'}.`}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Full name" htmlFor="profile-name">
            <input
              id="profile-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Phone" htmlFor="profile-phone">
            <input
              id="profile-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClass}
              placeholder="Optional"
            />
          </Field>

          <Field
            label="Department"
            hint="Shown next to your name in reports and the audit trail."
            htmlFor="profile-department"
          >
            <input
              id="profile-department"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className={inputClass}
            />
          </Field>

          {error && <InlineMessage tone="error">{error}</InlineMessage>}
          {success && <InlineMessage tone="success">{success}</InlineMessage>}

          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="inline-flex items-center justify-center bg-primary text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-all disabled:opacity-50 min-h-[44px]"
          >
            {updateProfile.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </Panel>

      <Panel title="What your role can do">
        <ul className="space-y-1.5 text-xs sm:text-sm text-slate-600 font-medium">
          <li><strong className="text-slate-900">Inspector</strong> — create inspections, upload evidence, run AR capture, record field tests and checklists.</li>
          <li><strong className="text-slate-900">Engineer</strong> — review and validate findings, classify cracks, confirm costs, sign recommendations, publish reports.</li>
          <li><strong className="text-slate-900">Admin</strong> — manage users, buildings, geohazard layers, storage and the audit trail.</li>
          <li><strong className="text-slate-900">Viewer</strong> — read published reports only.</li>
        </ul>
        <p className="text-[11px] text-slate-500 font-medium">
          Roles are changed by an administrator. This page cannot change your own role.
        </p>
      </Panel>
    </div>
  )
}
