'use client'

import { DeepAnalysisButton } from '@/components/ai/deep-analysis-button'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ARPose } from '@/app/types'
import { useProfile, useInspections, useARAnchors } from '@/app/lib/queries'
import { useStartARSession, useEndARSession, useCreateARAnchor, useDeleteARAnchor } from '@/app/lib/mutations'
import { hasCapability } from '@/app/lib/role-utils'
import { inspectionStartError } from '@/app/lib/ar/permission-errors'
import { MarkerlessRuntime, type XRInspectionState } from './markerless-runtime'

const IDLE: XRInspectionState = { active: false, sessionKey: null, tracking: false, hit: false, pins: {}, message: null }
const UNSUPPORTED_AR_MESSAGE = 'This device or browser does not support markerless AR. Use camera/photo inspection to save evidence without spatial tracking or printed targets.'

export function MarkerlessInspection({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const { data: profile } = useProfile()
  const { data: inspections = [] } = useInspections()
  const [inspectionId, setInspectionId] = useState('')
  useEffect(() => {
    const linkedInspection = new URL(window.location.href).searchParams.get('inspectionId')
    if (linkedInspection) setInspectionId(linkedInspection)
  }, [])
  const selectedId = inspectionId || inspections[0]?.id || ''
  const { data: markers = [] } = useARAnchors(selectedId || undefined)
  const startRow = useStartARSession().mutateAsync
  const endRow = useEndARSession().mutateAsync
  const createMarker = useCreateARAnchor().mutateAsync
  const deleteMarker = useDeleteARAnchor()
  const [xrSupported, setXrSupported] = useState<boolean | null>(null)
  const [state, setState] = useState(IDLE)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraPlaying, setCameraPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arStartError, setArStartError] = useState<{ message: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [label, setLabel] = useState('Inspection point')
  const [notes, setNotes] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rowRef = useRef<{ id: string; inspectionId: string; key: string } | null>(null)
  const generation = useRef(0)
  const busyRef = useRef(false)
  const savingRef = useRef(false)
  const runtime = useRef<MarkerlessRuntime | null>(null)
  const endRowRef = useRef(endRow)
  endRowRef.current = endRow

  const closeRow = useCallback(async () => {
    const row = rowRef.current
    rowRef.current = null
    if (row) await endRowRef.current({ sessionId: row.id, inspectionId: row.inspectionId })
  }, [])
  const stop = useCallback(async () => {
    generation.current++
    await runtime.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
    setCameraPlaying(false)
    await closeRow()
  }, [closeRow])

  useEffect(() => {
    let mounted = true
    navigator.xr?.isSessionSupported('immersive-ar').then((supported) => { if (mounted) setXrSupported(supported) })
      .catch(() => { if (mounted) setXrSupported(false) })
    if (!navigator.xr) setXrSupported(false)
    runtime.current = new MarkerlessRuntime((next) => { if (mounted) setState(next) }, () => {
      generation.current++
      if (mounted) setNotice('AR session ended. Saved records remain available; spatial points will not be restored in a new session.')
      void closeRow().catch(() => { if (mounted) setError('The AR session ended, but its record could not be closed. Reload before starting again.') })
    })
    return () => {
      mounted = false
      generation.current++
      void runtime.current?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      void closeRow().catch((cause) => console.error('Could not close inspection session:', cause))
    }
  }, [closeRow])

  const active = state.active || cameraActive
  useEffect(() => {
    if (!arStartError) return
    const timeout = window.setTimeout(() => setArStartError(null), 8000)
    return () => window.clearTimeout(timeout)
  }, [arStartError])
  useEffect(() => {
    document.documentElement.classList.toggle('ar-immersive', state.active)
    return () => document.documentElement.classList.remove('ar-immersive')
  }, [state.active])
  useEffect(() => { onActiveChange?.(active || busy || saving); return () => onActiveChange?.(false) }, [active, busy, saving, onActiveChange])
  const start = async (mode: 'webxr' | 'camera') => {
    if (busyRef.current || !selectedId) return
    if (mode === 'webxr' && xrSupported === false) {
      setArStartError({ message: UNSUPPORTED_AR_MESSAGE })
      return
    }
    busyRef.current = true
    setBusy(true); setError(null); setNotice(null); setArStartError(null)
    const current = ++generation.current
    try {
      let key: string
      if (mode === 'webxr') {
        if (!overlayRef.current || !runtime.current) throw new Error('The AR viewport is not ready')
        // Do not insert a network await before this user-gesture-sensitive request.
        key = await runtime.current.start(overlayRef.current)
      } else {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS and a browser with camera support')
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        if (current !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error('Camera preview is unavailable')
        video.muted = true; video.playsInline = true; video.srcObject = stream
        await video.play()
        setCameraActive(true)
        key = crypto.randomUUID()
      }
      if (current !== generation.current) return
      const row = await startRow({ inspectionId: selectedId,
        deviceInfo: { engine: mode === 'webxr' ? 'WebXR session-only' : 'Camera photo annotation', trackingSessionKey: key, checkpointPersistence: false } })
      if (current !== generation.current) { await endRow({ sessionId: row.id, inspectionId: selectedId }); return }
      rowRef.current = { id: row.id, inspectionId: selectedId, key }
    } catch (cause) {
      if (current === generation.current) {
        await stop().catch(() => {})
        const message = inspectionStartError(cause, mode)
        if (mode === 'webxr') setArStartError({ message })
        else setError(message)
      }
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const save = async () => {
    const row = rowRef.current
    if (!row || savingRef.current) return
    savingRef.current = true
    setSaving(true); setError(null)
    let pose: ARPose | null = null
    const current = generation.current
    try {
      let snapshotDataUrl: string | undefined
      if (state.active) {
        pose = await runtime.current!.capture()
      } else {
        const video = videoRef.current
        if (!video || video.paused || video.readyState < 2 || !video.videoWidth) throw new Error('Resume the camera before saving a photo')
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth; canvas.height = video.videoHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Camera capture is unavailable')
        context.drawImage(video, 0, 0)
        snapshotDataUrl = canvas.toDataURL('image/jpeg', .85)
        pose = { position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
          sessionTracking: { kind: 'camera-frame-v1', sessionKey: row.key, point: { x: .5, y: .5 } } }
      }
      if (current !== generation.current) throw new Error('The session ended before the point could be saved')
      const marker = await createMarker({ sessionId: row.id, inspectionId: row.inspectionId,
        label: label.trim() || 'Inspection point', notes, damageType: 'none', pose, snapshotDataUrl })
      if (current === generation.current) {
        runtime.current?.register(marker.id, pose)
        setDetailsOpen(false)
        setNotice(state.active ? 'Point saved. It tracks during this session only; no camera photo was available from WebXR.' : 'Photo and centre annotation saved. This is not a spatial checkpoint.')
      } else runtime.current?.discard(pose)
    } catch (cause) {
      if (pose) runtime.current?.discard(pose)
      setError(cause instanceof Error ? cause.message : 'Could not save the inspection point')
    } finally {
      savingRef.current = false; setSaving(false)
    }
  }

  if (!profile) return <p role="status">Loading inspection access…</p>
  if (!hasCapability(profile.role, 'ar:use')) return <p>Inspection capture is available to inspectors and admins.</p>

  return <section className="space-y-4">
    {arStartError && <div role="alert" aria-atomic="true" className="fixed inset-x-4 top-4 z-[120] mx-auto flex max-w-md items-start gap-3 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-800 shadow-lg">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Markerless AR unavailable</p>
        <p className="mt-1">{arStartError.message}</p>
      </div>
      <button type="button" aria-label="Dismiss AR error" onClick={() => setArStartError(null)} className="min-h-[44px] min-w-[44px] rounded-lg px-2 font-semibold">Close</button>
    </div>}
    <div hidden={state.active} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <h2 className="text-xl text-primary">Markerless inspection</h2>
      <p className="text-sm text-slate-600">Mark detected surfaces during one AR session. Records are saved, but physical locations are not restored after you end or reload.</p>
      <label className="block text-sm font-semibold">Inspection
        <select value={selectedId} disabled={active || busy} onChange={(event) => {
          setInspectionId(event.target.value)
          const url = new URL(window.location.href)
          url.searchParams.set('inspectionId', event.target.value)
          window.history.replaceState({}, '', url.toString())
        }} className="mt-1 block min-h-[44px] w-full min-w-0 rounded-lg border border-slate-300 p-3">
          {!inspections.length && <option value="">No inspections available</option>}
          {inspections.map((inspection) => <option key={inspection.id} value={inspection.id}>{inspection.location || inspection.building_name || inspection.id.slice(0, 8)}</option>)}
        </select>
      </label>
      {!active && <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2" role="group" aria-label="Start inspection">
        <button type="button" disabled={busy || !selectedId || xrSupported === null} onClick={() => void start('webxr')}
          className="min-h-12 w-full min-w-0 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Starting…' : 'Start markerless AR'}</button>
        <button type="button" disabled={busy || !selectedId} onClick={() => void start('camera')}
          className="min-h-12 w-full min-w-0 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold">Use camera/photo inspection</button>
      </div>}
    </div>
    <div ref={overlayRef} data-markerless-overlay data-xr-active={state.active} className={`relative h-[420px] overflow-hidden rounded-lg border border-slate-200 ${state.active ? 'bg-transparent' : 'bg-slate-950'}`}>
      <video ref={videoRef} autoPlay muted playsInline onPlaying={() => setCameraPlaying(true)} onPause={() => setCameraPlaying(false)}
        className="absolute inset-0 h-full w-full object-cover" style={{ display: state.active ? 'none' : 'block' }} />
      {!active && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-white">Start markerless AR on a supported device, or open camera/photo inspection.</p>}
      {state.active && Object.entries(state.pins).map(([id, pin]) => <div key={id} data-xr-marker={id} className="absolute -translate-x-1/2 -translate-y-full rounded-lg bg-black/80 p-2 text-xs text-white pointer-events-none" style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}>
        {markers.find((marker) => marker.id === id)?.label || 'Saved point'}<span className="block">{pin.distance.toFixed(1)} m · this session</span>
      </div>)}
      {active && <div className="absolute inset-0 flex flex-col justify-between p-3 pointer-events-none">
        <div className="flex items-start justify-between gap-2 pointer-events-auto">
          <p role="status" className="rounded-lg bg-black/80 p-2 text-xs text-white">{state.active ? state.tracking ? state.hit ? 'Surface detected · session only' : 'Aim at a surface' : 'Tracking lost' : 'Camera/photo annotation'}</p>
          <button type="button" disabled={busy || saving} onClick={() => void stop().catch(() => setError('Could not close the session record. Reload before starting again.'))}
            className="min-h-[44px] rounded-lg bg-white px-3 text-sm font-semibold">End inspection</button>
        </div>
        <div className={`absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${state.active && !state.hit ? 'border-amber-300' : 'border-emerald-300'}`} />
        <div className="space-y-2 pointer-events-auto">
          {cameraActive && !cameraPlaying && <button type="button" onClick={() => {
            void videoRef.current?.play().catch(() => setError('Camera playback could not resume. End inspection and start the camera again.'))
          }} className="min-h-[44px] w-full rounded-lg bg-white px-3 text-sm font-semibold">Resume camera preview</button>}
          {state.message && <p className="rounded-lg bg-black/80 p-2 text-xs text-white">{state.message}</p>}
          {error && <p role="alert" className="rounded-lg bg-red-950 p-2 text-sm text-white">{error}</p>}
          {notice && <p role="status" className="rounded-lg bg-black/80 p-2 text-xs text-white">{notice}</p>}
          {detailsOpen && <div className="space-y-2 rounded-lg bg-white p-3">
            <label className="block text-sm">Point label<input maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
            <label className="block text-sm">Inspection notes<textarea maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded border border-slate-300 p-2" /></label>
          </div>}
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => setDetailsOpen(!detailsOpen)} className="min-h-[44px] rounded-lg bg-white px-3 text-sm font-semibold">Details</button>
            <button type="button" onClick={() => void save()} disabled={busy || saving || (state.active ? !state.tracking || !state.hit : !cameraPlaying)}
              className="min-h-[44px] flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving…' : state.active ? 'Save surface point' : 'Capture photo + centre point'}</button>
          </div>
          <p className="rounded bg-black/80 p-2 text-xs text-white">{state.active ? 'WebXR camera passthrough cannot be saved as a photo here. Use camera/photo inspection for image evidence.' : 'The centre crosshair marks a point in this photo. No physical tracking or depth measurement.'}</p>
        </div>
      </div>}
    </div>
    {!active && error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!active && notice && <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{notice}</p>}
    <section hidden={state.active} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3" aria-label="Saved inspection records">
      <h3 className="text-base font-semibold">Saved inspection records</h3>
      {!markers.length && <p className="text-sm text-slate-600">No saved inspection points yet.</p>}
      {markers.map((marker) => <div key={marker.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="min-w-0">
          <p className="font-semibold">{marker.label}</p>
          <p className="text-xs text-slate-600">{marker.pose.sessionTracking?.kind === 'webxr-session-v1' ? 'WebXR session-only record · not a restored checkpoint' : marker.pose.sessionTracking?.kind === 'camera-frame-v1' ? 'Photo annotation · no spatial tracking' : marker.pose.reference ? 'Printed-reference record' : 'Legacy record'}</p>
          {marker.snapshot_path && <DeepAnalysisButton anchorId={marker.id} />}
          {marker.notes && <p className="text-sm text-slate-600">{marker.notes}</p>}
          {marker.image_url && <img src={marker.image_url} alt={`Evidence for ${marker.label}`} className="mt-2 h-24 w-36 rounded-lg object-cover" />}
        </div>
        <button type="button" disabled={deleteMarker.isPending} aria-label={`Delete saved point ${marker.label}`} onClick={() => {
          void deleteMarker.mutateAsync({ anchorId: marker.id, inspectionId: selectedId }).then(() => runtime.current?.discard(marker.pose)).catch(() => setError('Could not delete this record. Check your permissions and try again.'))
        }} className="min-h-[44px] px-3 text-sm font-semibold text-red-700">Delete</button>
      </div>)}
    </section>
  </section>
}
