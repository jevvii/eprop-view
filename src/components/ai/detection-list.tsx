'use client'

import { useState } from 'react'
import type { AIDamageDetection, DamageType, SeverityLevel } from '@/app/types'
import { SeverityBadge } from './severity-badge'
import { useVerifyDetection, useUpdateAIDetection } from '@/app/lib/mutations'
import { useProfile } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'
import { Button } from '@/components/ui/button'

interface DetectionListProps {
  detections: AIDamageDetection[]
}

const damageTypeOptions: DamageType[] = ['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']
const severityOptions: SeverityLevel[] = ['low', 'medium', 'high', 'critical']

export function DetectionList({ detections }: DetectionListProps) {
  const { data: profile } = useProfile()
  const verify = useVerifyDetection()
  const updateDetection = useUpdateAIDetection()

  const canReview = hasCapability(profile?.role, 'ai:review')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDamageType, setEditDamageType] = useState<DamageType>('crack')
  const [editSeverity, setEditSeverity] = useState<SeverityLevel>('medium')
  const [editScore, setEditScore] = useState<number>(50)
  const [editNotes, setEditNotes] = useState<string>('')

  const startEdit = (detection: AIDamageDetection) => {
    if (!canReview) return
    setEditingId(detection.id)
    setEditDamageType(detection.damage_type)
    setEditSeverity(detection.severity)
    setEditScore(detection.severity_score)
    setEditNotes(detection.notes || '')
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const saveEdit = async (detectionId: string) => {
    await updateDetection.mutateAsync({
      detectionId,
      params: {
        damage_type: editDamageType,
        severity: editSeverity,
        severity_score: editScore,
        notes: editNotes,
      },
    })
    setEditingId(null)
  }

  if (detections.length === 0) {
    return (
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
        No AI detections recorded.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {detections.map((detection) => {
        const isVerified = Boolean(detection.verified_by)
        const isRejected = !isVerified && (
          detection.notes?.toLowerCase().includes('reject') ||
          detection.notes?.toLowerCase().includes('false positive')
        )
        const isEditing = editingId === detection.id

        if (isEditing) {
          return (
            <div
              key={detection.id}
              className="border border-primary/30 rounded-2xl p-4 bg-primary/5 space-y-3 animate-in fade-in"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                  Validate & Adjust Detection
                </span>
                <button
                  onClick={cancelEdit}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-700"
                >
                  ✕ Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Damage Type
                  </label>
                  <select
                    value={editDamageType}
                    onChange={(e) => setEditDamageType(e.target.value as DamageType)}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
                  >
                    {damageTypeOptions.map((t) => (
                      <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Severity
                  </label>
                  <select
                    value={editSeverity}
                    onChange={(e) => {
                      const sev = e.target.value as SeverityLevel
                      setEditSeverity(sev)
                      if (sev === 'critical') setEditScore(90)
                      else if (sev === 'high') setEditScore(75)
                      else if (sev === 'medium') setEditScore(50)
                      else setEditScore(25)
                    }}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
                  >
                    {severityOptions.map((s) => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                    Score (0-100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editScore}
                    onChange={(e) => setEditScore(Number(e.target.value))}
                    className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">
                  Validator / Engineering Notes
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Adjusted crack width and severity rating per on-site verification."
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEdit}
                  className="text-[9px] font-bold uppercase tracking-wider py-1 px-3"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={updateDetection.isPending}
                  onClick={() => saveEdit(detection.id)}
                  className="text-[9px] font-black uppercase tracking-wider py-1 px-4 bg-primary text-white"
                >
                  {updateDetection.isPending ? 'Saving...' : 'Apply Adjustments'}
                </Button>
              </div>
            </div>
          )
        }

        return (
          <div
            key={detection.id}
            className={`border rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
              isVerified
                ? 'bg-emerald-50/40 border-emerald-100'
                : isRejected
                ? 'bg-slate-100/60 border-slate-200 opacity-75'
                : 'bg-slate-50 border-slate-100'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                  {detection.damage_type}
                </span>
                <SeverityBadge severity={detection.severity} />
                {isVerified && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase tracking-wider border border-emerald-200">
                    ✓ Verified
                  </span>
                )}
                {isRejected && (
                  <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[8px] font-black uppercase tracking-wider border border-slate-300">
                    ✗ False Positive
                  </span>
                )}
              </div>
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-2 flex-wrap">
                <span>Confidence {(detection.confidence * 100).toFixed(1)}%</span>
                <span>·</span>
                <span>Score {detection.severity_score}/100</span>
                {detection.notes && (
                  <>
                    <span>·</span>
                    <span className="text-slate-400 normal-case italic">{detection.notes}</span>
                  </>
                )}
              </div>
            </div>

            {canReview && (
              <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startEdit(detection)}
                  className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-700 transition-colors"
                >
                  Adjust
                </Button>

                {!isVerified && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={verify.isPending}
                    onClick={() =>
                      verify.mutate({
                        detectionId: detection.id,
                        approved: true,
                        notes: 'Verified by structural engineer.',
                      })
                    }
                    className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
                  >
                    {isRejected ? 'Re-Verify' : 'Verify'}
                  </Button>
                )}

                {isVerified && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={verify.isPending}
                    onClick={() =>
                      verify.mutate({
                        detectionId: detection.id,
                        approved: false,
                        notes: 'Rejected: Marked as false positive.',
                      })
                    }
                    className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
                  >
                    Reject
                  </Button>
                )}

                {!isVerified && !isRejected && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={verify.isPending}
                    onClick={() =>
                      verify.mutate({
                        detectionId: detection.id,
                        approved: false,
                        notes: 'Rejected: Marked as false positive.',
                      })
                    }
                    className="text-[9px] font-black uppercase tracking-wider h-auto py-1.5 px-3 bg-white hover:bg-slate-200 text-slate-500 transition-colors"
                  >
                    Reject
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
