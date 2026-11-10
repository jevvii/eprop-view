'use client'

import { useState, useCallback } from 'react'
import { useCreateARAnchor } from '@/app/lib/mutations'
import { analyzeCapturedFrame } from '@/app/actions/ai-frame'
import { useARSessionContext } from './ar-session-manager'
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

const labelMap: Record<DamageType, string> = {
  crack: 'Surface Tension Crack',
  spalling: 'Concrete Spalling & Void',
  corrosion: 'Reinforcement Corrosion',
  leakage: 'Seepage & Efflorescence',
  deformation: 'Structural Deflection',
  none: 'Structural Member',
}

export function ARAnchorForm({ sessionId, inspectionId, hitPose, onSaved }: ARAnchorFormProps) {
  const createAnchor = useCreateARAnchor()
  const { captureCurrentFrame, activeMode } = useARSessionContext()
  const evidenceUnavailable = activeMode === 'webxr'

  const [label, setLabel] = useState('Structural Marker')
  const [damageType, setDamageType] = useState<DamageType>('crack')
  const [severity, setSeverity] = useState<SeverityLevel>('medium')
  const [notes, setNotes] = useState('')
  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [isScanningAI, setIsScanningAI] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const activePose: ARPose = hitPose || {
    position: { x: 0, y: -0.15, z: -1.45 },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  }

  const handleCaptureSnapshot = useCallback(() => {
    const frame = captureCurrentFrame()
    if (frame) {
      setSnapshot(frame)
      setScanError(null)
      return
    }

    setScanError(
      evidenceUnavailable
        ? 'Immersive WebXR does not expose the camera frame. Switch to camera mode to capture evidence.'
        : 'No camera frame is available. Start the camera first.'
    )
  }, [captureCurrentFrame, evidenceUnavailable])

  const handleAICameraScan = async () => {
    setScanError(null)
    const frame = captureCurrentFrame()

    if (!frame) {
      setScanError(
        evidenceUnavailable
          ? 'Immersive WebXR cannot capture a frame for analysis. Switch to camera mode to run the heuristic.'
          : 'No camera frame is available. Start the camera first.'
      )
      return
    }

    setSnapshot(frame)
    setIsScanningAI(true)

    try {
      const result = await analyzeCapturedFrame({ inspectionId, dataUrl: frame })

      if (!result) {
        setNotes('Heuristic analysis: no defect pattern detected in this frame.')
        return
      }

      setDamageType(result.damageType)
      setSeverity(result.severity)
      setLabel(labelMap[result.damageType])
      setNotes(
        `Heuristic edge/colour analysis (non-ML): ${result.damageType} at ${(
          result.confidence * 100
        ).toFixed(0)}% confidence. Not a trained classifier.`
      )
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Frame analysis failed')
    } finally {
      setIsScanningAI(false)
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setScanError(null)

    try {
      await createAnchor.mutateAsync({
        sessionId,
        inspectionId,
        label,
        pose: activePose,
        damageType,
        severity,
        notes,
        snapshotDataUrl: snapshot || undefined,
      })

      setSnapshot(null)
      onSaved?.()
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Could not save the anchor')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="text-xs sm:text-xs font-black text-slate-800 tracking-[0.2em] uppercase">
            Spatial Anchor Control
          </h4>
        </div>
        <button
          type="button"
          onClick={handleAICameraScan}
          disabled={isScanningAI || evidenceUnavailable}
          className="text-xs font-black text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl uppercase tracking-wider transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isScanningAI ? 'Analyzing…' : 'Analyze Frame (heuristic)'}
        </button>
      </div>

      {scanError && (
        <p role="alert" className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
          {scanError}
        </p>
      )}

      {/* Surface Coordinate Telemetry */}
      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs">
        <div className="flex justify-between text-slate-400 font-bold uppercase tracking-wider mb-1">
          <span>Marker Pose (screen-space)</span>
          <span className={hitPose ? 'text-emerald-600 font-black' : 'text-amber-600 font-black'}>
            {hitPose ? 'WebXR hit' : 'Estimated'}
          </span>
        </div>
        <div className="font-mono text-slate-700 font-bold tabular-nums">
          X: {activePose.position.x.toFixed(2)}m · Y: {activePose.position.y.toFixed(2)}m · Z:{' '}
          {activePose.position.z.toFixed(2)}m
        </div>
      </div>

      <div className="space-y-3.5">
        <div>
          <label
            htmlFor="ar-anchor-label"
            className="block text-xs font-black text-primary uppercase tracking-widest mb-1 ml-1"
          >
            Anchor Label
          </label>
          <input
            id="ar-anchor-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base sm:text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="ar-anchor-damage-type"
              className="block text-xs font-black text-primary uppercase tracking-widest mb-1 ml-1"
            >
              Damage Type
            </label>
            <select
              id="ar-anchor-damage-type"
              value={damageType}
              onChange={(e) => setDamageType(e.target.value as DamageType)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base sm:text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]"
            >
              {damageTypes.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="ar-anchor-severity"
              className="block text-xs font-black text-primary uppercase tracking-widest mb-1 ml-1"
            >
              Severity
            </label>
            <select
              id="ar-anchor-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base sm:text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]"
            >
              {severities.map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label
            htmlFor="ar-anchor-notes"
            className="block text-xs font-black text-primary uppercase tracking-widest mb-1 ml-1"
          >
            Field Notes / Context
          </label>
          <input
            id="ar-anchor-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., Near column C3 joint intersection..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base sm:text-sm font-bold bg-slate-50 outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]"
          />
        </div>

        {/* Camera Snapshot Attachment Section */}
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-600 uppercase tracking-wider">
              {snapshot ? 'Camera snapshot attached' : 'Visual frame evidence'}
            </span>
            <button
              type="button"
              onClick={handleCaptureSnapshot}
              disabled={evidenceUnavailable}
              className="text-xs font-black text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200 px-3 py-1.5 rounded-lg uppercase tracking-wider transition-colors min-h-[36px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {snapshot ? 'Retake frame' : 'Capture frame'}
            </button>
          </div>

          {evidenceUnavailable && (
            <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
              Immersive WebXR does not expose the camera frame. Use{' '}
              <span className="font-semibold">Use camera instead</span> above to capture evidence or run
              analysis.
            </p>
          )}

          {snapshot ? (
            <div className="flex items-center gap-3 pt-1">
              <img
                src={snapshot}
                alt="Captured visual evidence"
                className="w-16 h-16 rounded-xl object-cover border-2 border-emerald-500 shadow-md shrink-0"
              />
              <div className="text-xs text-slate-500 leading-tight">
                <span className="font-bold text-emerald-600">Frame staged.</span> It will be re-encoded
                and stored privately, then linked to this anchor.
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-medium">
              Capture a freeze frame of the inspected surface. Analysis is a deterministic heuristic,
              not a trained model.
            </p>
          )}
        </div>
      </div>

      <Button
        type="submit"
        disabled={createAnchor.isPending}
        className="w-full text-xs font-black uppercase tracking-[0.15em] py-3.5 h-auto shadow-lg shadow-primary/20 min-h-[44px] rounded-xl"
      >
        {createAnchor.isPending ? 'Saving Anchor…' : 'Drop & Persist Anchor'}
      </Button>
    </form>
  )
}
