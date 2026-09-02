'use client'

import { useState } from 'react'
import { useCreateARAnchor } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'
import type { ARPose, DamageType, SeverityLevel } from '@/app/types'

interface ARAnchorFormProps {
  sessionId: string
  inspectionId: string
  hitPose?: ARPose | null
  onSaved?: () => void
}

const damageTypes: DamageType[] = ['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none']
const severities: SeverityLevel[] = ['low', 'medium', 'high', 'critical']

export function ARAnchorForm({ sessionId, inspectionId, hitPose, onSaved }: ARAnchorFormProps) {
  const createAnchor = useCreateARAnchor()
  const [label, setLabel] = useState('Structural Marker')
  const [damageType, setDamageType] = useState<DamageType>('crack')
  const [severity, setSeverity] = useState<SeverityLevel>('medium')
  const [notes, setNotes] = useState('')
  const [isScanningAI, setIsScanningAI] = useState(false)

  const activePose: ARPose = hitPose || {
    position: { x: 0, y: 0, z: -1 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  }

  const handleAICameraScan = async () => {
    setIsScanningAI(true)
    try {
      const { calculateDefectSeverity } = await import('@/app/lib/ai/severity-scoring')
      await new Promise((res) => setTimeout(res, 400))
      
      // Calculate defect based on spatial coordinates and surface depth
      const depth = Math.abs(activePose.position.z || 1.0)
      const defectTypes: DamageType[] = ['crack', 'spalling', 'corrosion', 'leakage', 'deformation']
      const seedIndex = Math.abs(Math.round((activePose.position.x * 10 + activePose.position.y * 5 + depth * 3))) % defectTypes.length
      const detectedType = defectTypes[seedIndex]

      const simulatedBox = {
        x: 0.35,
        y: 0.35,
        width: Math.min(0.3, Math.max(0.08, 0.2 / depth)),
        height: Math.min(0.3, Math.max(0.08, 0.2 / depth)),
      }
      const confidence = Number((0.85 + (seedIndex % 10) * 0.01).toFixed(2))
      const { severity } = calculateDefectSeverity(detectedType, simulatedBox, confidence)

      const labelMap: Record<DamageType, string> = {
        crack: 'Surface Tension Crack',
        spalling: 'Concrete Spalling & Void',
        corrosion: 'Reinforcement Corrosion',
        leakage: 'Seepage & Efflorescence',
        deformation: 'Structural Deflection',
        none: 'Structural Member',
      }

      setDamageType(detectedType)
      setSeverity(severity)
      setLabel(labelMap[detectedType])
      setNotes(`Optical Scan: ${detectedType.toUpperCase()} at depth ${depth.toFixed(1)}m (Confidence: ${(confidence * 100).toFixed(0)}%).`)
    } finally {
      setIsScanningAI(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    await createAnchor.mutateAsync({
      sessionId,
      inspectionId,
      label,
      pose: activePose,
      damageType,
      severity,
      notes,
    })

    onSaved?.()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-50 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="text-[10px] font-black text-slate-700 tracking-[0.2em] uppercase">Spatial Anchor Control</h4>
        </div>
        <button
          type="button"
          onClick={handleAICameraScan}
          disabled={isScanningAI}
          className="text-[8px] font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg uppercase tracking-wider transition-colors"
        >
          {isScanningAI ? 'Analyzing Frame…' : 'Demo AI Suggestion 🪄'}
        </button>
      </div>

      {/* Surface Coordinate Telemetry */}
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-[9px]">
        <div className="flex justify-between text-slate-400 font-bold uppercase tracking-wider mb-1">
          <span>Target Pose (6-DOF)</span>
          <span className={hitPose ? 'text-emerald-600 font-black' : 'text-amber-600 font-black'}>
            {hitPose ? 'Plane Locked' : 'Default Projection'}
          </span>
        </div>
        <div className="font-mono text-slate-700 font-bold text-[10px]">
          X: {activePose.position.x.toFixed(2)}m · Y: {activePose.position.y.toFixed(2)}m · Z: {activePose.position.z.toFixed(2)}m
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-[9px] font-black text-primary uppercase tracking-widest mb-1 ml-1">Anchor Label</label>
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

        <div>
          <label className="block text-[9px] font-black text-primary uppercase tracking-widest mb-1 ml-1">Notes / Context</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Near column intersection..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={createAnchor.isPending}
        className="w-full text-[9px] font-black uppercase tracking-[0.2em] py-3 h-auto shadow-lg shadow-primary/20"
      >
        {createAnchor.isPending ? 'Saving Anchor…' : 'Drop & Persist Anchor'}
      </Button>
    </form>
  )
}
