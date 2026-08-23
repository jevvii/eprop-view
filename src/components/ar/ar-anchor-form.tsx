'use client'

import { useState } from 'react'
import { useCreateARAnchor } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import type { ARPose, DamageType, SeverityLevel } from '@/app/types'

interface ARAnchorFormProps {
  sessionId: string
  inspectionId: string
  onSaved?: () => void
}

const damageTypes: DamageType[] = ['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']
const severities: SeverityLevel[] = ['low', 'medium', 'high', 'critical']

export function ARAnchorForm({ sessionId, inspectionId, onSaved }: ARAnchorFormProps) {
  const createAnchor = useCreateARAnchor()
  const [label, setLabel] = useState('Damage marker')
  const [damageType, setDamageType] = useState<DamageType>('crack')
  const [severity, setSeverity] = useState<SeverityLevel>('medium')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    // Prototype pose: identity pose centered in front of the camera
    const pose: ARPose = {
      position: { x: 0, y: 0, z: -1 },
      quaternion: { x: 0, y: 0, z: 0, w: 1 },
    }

    await createAnchor.mutateAsync({
      sessionId,
      inspectionId,
      label,
      pose,
      damageType,
      severity,
    })

    onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-50 pb-3">
        <h4 className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase">Drop Anchor</h4>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[9px] font-black text-primary uppercase tracking-widest mb-1 ml-1">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[9px] font-black text-primary uppercase tracking-widest mb-1 ml-1">Damage Type</label>
            <select
              value={damageType}
              onChange={(e) => setDamageType(e.target.value as DamageType)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20"
            >
              {damageTypes.map((t) => (
                <option key={t} value={t}>{t.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] font-black text-primary uppercase tracking-widest mb-1 ml-1">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20"
            >
              {severities.map((s) => (
                <option key={s} value={s}>{s.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        disabled={createAnchor.isPending}
        className="w-full text-[9px] font-black uppercase tracking-[0.2em] py-3 h-auto"
      >
        {createAnchor.isPending ? 'Saving…' : 'Save AR Anchor'}
      </Button>
    </form>
  )
}
