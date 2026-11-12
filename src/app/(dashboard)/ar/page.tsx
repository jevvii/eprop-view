'use client'

import { DeepAnalysisButton } from '@/components/ai/deep-analysis-button'
import { MapPin, Trash2 } from 'lucide-react'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ARSessionManager, useARSessionContext } from '@/components/ar/ar-session-manager'
import { ARCameraView } from '@/components/ar/ar-camera-view'
import { AROverlay } from '@/components/ar/ar-overlay'
import { ARAnchorForm } from '@/components/ar/ar-anchor-form'
import { ReferenceTargetControls } from '@/components/ar/reference-target-controls'
import { useReferenceTracking } from '@/components/ar/use-reference-tracking'
import { getReferencePose, getValidReference, type Point2D } from '@/app/lib/ar/printed-reference'
import { inspectionStartError } from '@/app/lib/ar/permission-errors'
import { useARAnchors, useProfile, useInspections } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'
import { AccessDenied } from '@/components/shared/require-role'
import { getActiveARSession } from '@/app/actions/ar'
import {
  useStartARSession,
  useEndARSession,
  useCreateARAnchor,
  useDeleteARAnchor,
} from '@/app/lib/mutations'
import { SeverityBadge } from '@/components/ai/severity-badge'
import { Button } from '@/components/ui/button'
import { MarkerlessInspection } from '@/components/ar/markerless-inspection'

function ARPageContent() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const searchParams = useSearchParams()
  const paramInspectionId = searchParams.get('inspectionId') || ''

  const { data: inspections = [], isLoading: inspectionsLoading } = useInspections()

  // Local state synced with URL param or auto-selected from inspection list
  const [selectedInspectionId, setSelectedInspectionId] = useState<string>(paramInspectionId)

  // Sync selectedInspectionId when searchParams change
  useEffect(() => {
    if (paramInspectionId) {
      setSelectedInspectionId(paramInspectionId)
    }
  }, [paramInspectionId])

  // If no inspection selected yet and inspections list finishes loading, select the first
  useEffect(() => {
    if (!selectedInspectionId && inspections.length > 0) {
      const firstId = inspections[0].id
      setSelectedInspectionId(firstId)
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.set('inspectionId', firstId)
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [selectedInspectionId, inspections])

  const inspectionId = selectedInspectionId

  const {
    activeMode,
    isActive,
    error,
    limitation,
    videoRef,
    startSession: startProgressiveAR,
    endSession: endProgressiveAR,
  } = useARSessionContext()

  const { data: anchors = [] } = useARAnchors(inspectionId || undefined)
  const startARSession = useStartARSession()
  const endARSession = useEndARSession()
  const endSessionRow = endARSession.mutateAsync
  const createARAnchor = useCreateARAnchor()
  const deleteARAnchor = useDeleteARAnchor()

  const [dbSessionId, setDbSessionId] = useState<string | null>(null)
  const dbSessionIdRef = useRef<string | null>(null)
  const [deletingAnchorId, setDeletingAnchorId] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [markerError, setMarkerError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const startLock = useRef(false)
  const workspaceGeneration = useRef(0)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [aim, setAim] = useState<Point2D>({ x: .5, y: .5 })
  const tracking = useReferenceTracking(videoRef, viewportRef, inspectionId, isActive && activeMode === 'optical-camera')
  const hitPose = tracking.frame ? getReferencePose(aim, tracking.frame, tracking.viewport) : null
  const captureEvidence = useCallback(() => tracking.captureEvidence(aim), [tracking.captureEvidence, aim])

  const canUseAR = hasCapability(profile?.role, 'ar:use')

  // Reattach to an already-active DB session instead of leaking it and
  // creating a second row on the next Start.
  useEffect(() => {
    if (!inspectionId) return
    let cancelled = false

    getActiveARSession(inspectionId)
      .then((active) => {
        if (cancelled || !active || dbSessionIdRef.current) return
        dbSessionIdRef.current = active.id
        setDbSessionId(active.id)
      })
      .catch((err) => {
        console.error('Could not read the active AR session:', err)
      })

    return () => {
      cancelled = true
    }
  }, [inspectionId])

  // Close the DB session when the workspace unmounts or the inspection changes.
  useEffect(() => {
    setStarting(false)
    startLock.current = false
    setDbSessionId(null)
    setAim({ x: .5, y: .5 })
    return () => {
      workspaceGeneration.current++
      void endProgressiveAR()
      const sessionToClose = dbSessionIdRef.current
      dbSessionIdRef.current = null
      if (sessionToClose) {
        void endSessionRow({ sessionId: sessionToClose, inspectionId })
          .catch((err) => console.error('Failed to close AR session on unmount:', err))
      }
    }
  }, [endSessionRow, endProgressiveAR, inspectionId])

  // Change inspection handler (syncs dropdown & browser URL)
  const handleInspectionChange = useCallback(
    (newId: string) => {
      setSelectedInspectionId(newId)
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        if (newId) {
          url.searchParams.set('inspectionId', newId)
        } else {
          url.searchParams.delete('inspectionId')
        }
        window.history.replaceState({}, '', url.toString())
      }
    },
    []
  )

  // Immersive WebXR needs a transparent page; the compositor supplies the camera.
  useEffect(() => {
    const immersive = activeMode === 'webxr'
    document.documentElement.classList.toggle('ar-immersive', immersive)
    return () => document.documentElement.classList.remove('ar-immersive')
  }, [activeMode])

  // A session ended by the OS or browser must also close the DB row.
  const wasActiveRef = useRef(false)
  useEffect(() => {
    if (wasActiveRef.current && !isActive) {
      const sessionToClose = dbSessionIdRef.current
      dbSessionIdRef.current = null
      setDbSessionId(null)
      if (sessionToClose) {
        void endSessionRow({ sessionId: sessionToClose, inspectionId })
          .catch((err) => console.error('Failed to close ended AR session:', err))
      }
    }
    wasActiveRef.current = isActive
  }, [isActive, inspectionId, endSessionRow])

  const handleStart = useCallback(async () => {
    if (!inspectionId || startLock.current) return
    startLock.current = true
    const generation = workspaceGeneration.current
    setStarting(true)
    setStartError(null)
    setMarkerError(null)
    try {
      // Printed references use the web camera on both Android and iPhone.
      await startProgressiveAR({ cameraOnly: true })
      if (generation !== workspaceGeneration.current) { await endProgressiveAR(); return }
      if (!dbSessionIdRef.current) {
        const existing = await getActiveARSession(inspectionId)
        const row = existing ?? await startARSession.mutateAsync({ inspectionId,
          deviceInfo: { engine: 'Printed reference (QR plane)', platform: 'web' } })
        if (generation !== workspaceGeneration.current) {
          await endSessionRow({ sessionId: row.id, inspectionId })
          await endProgressiveAR()
          return
        }
        dbSessionIdRef.current = row.id
        setDbSessionId(row.id)
      }
    } catch (err) {
      if (generation === workspaceGeneration.current) setStartError(inspectionStartError(err, 'camera'))
      await endProgressiveAR()
    } finally {
      if (generation === workspaceGeneration.current) {
        startLock.current = false
        setStarting(false)
      }
    }
  }, [inspectionId, startProgressiveAR, startARSession, endProgressiveAR, endSessionRow])

  const handleEnd = useCallback(async () => {
    await endProgressiveAR()
    // The isActive effect closes the database row after the camera stops.
  }, [endProgressiveAR])

  const handleTapToAnchor = useCallback(async () => {
    if (!isActive || !dbSessionId || !inspectionId || createARAnchor.isPending) return
    setMarkerError(null)
    try {
      const evidence = captureEvidence()
      if (!evidence?.pose.reference) throw new Error('Keep the printed reference visible in the camera frame before placing a marker.')
      const { pose, snapshotDataUrl } = evidence
      await createARAnchor.mutateAsync({ sessionId: dbSessionId, inspectionId,
        label: `Marker ${anchors.length + 1}`, pose, damageType: 'none', snapshotDataUrl,
        notes: `Manual point on ${evidence.pose.reference.target.label}. No defect classification was made.` })
    } catch (err) {
      setMarkerError(err instanceof Error ? err.message : 'Could not save the marker. Try again.')
    }
  }, [isActive, dbSessionId, inspectionId, createARAnchor, captureEvidence, anchors.length])

  const handleDeleteAnchor = useCallback(
    async (anchorId: string) => {
      setDeletingAnchorId(anchorId)
      try {
        await deleteARAnchor.mutateAsync({ anchorId, inspectionId })
      } catch (err) {
        console.error('Failed to delete anchor:', err)
      } finally {
        setDeletingAnchorId(null)
      }
    },
    [deleteARAnchor, inspectionId]
  )

  const activeInspection = useMemo(() => {
    return inspections.find((i) => i.id === inspectionId)
  }, [inspections, inspectionId])

  if (profileLoading) {
    return (
      <div className="bg-white p-6 sm:p-10 rounded-lg sm:rounded-lg shadow-sm h-80 animate-pulse border border-slate-100 mx-2" />
    )
  }

  if (profile && !canUseAR) {
    return (
      <AccessDenied
        title="AR Inspection Restricted"
        message="Augmented Reality (AR) field capture is restricted to certified Field Inspectors. Engineering reviewers and administrators can inspect submitted visual evidence and spatial anchors in the Document Vault."
        returnHref="/document"
        returnLabel="View Document Vault"
      />
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header & Inspection Selector Bar */}
      <div className="bg-white p-4 sm:p-6 rounded-lg sm:rounded-lg shadow-md border border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-koulen text-primary tracking-wide uppercase">
              AR Inspection Mode
            </h2>
            <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Printed reference AR
            </span>
          </div>

          {/* In-Page Inspection Selector Dropdown */}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
            <label
              htmlFor="ar-inspection-select"
              className="text-xs font-black uppercase tracking-wider text-slate-500 shrink-0"
            >
              Inspection:
            </label>
            <div className="relative w-full min-w-0 sm:max-w-md sm:flex-1">
              <select
                id="ar-inspection-select"
                data-testid="ar-inspection-select"
                value={selectedInspectionId}
                onChange={(e) => handleInspectionChange(e.target.value)}
                disabled={isActive || starting}
                className="w-full text-base sm:text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 pr-8 outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px] disabled:opacity-60"
              >
                {inspectionsLoading ? (
                  <option value="">Loading inspections…</option>
                ) : inspections.length === 0 ? (
                  <option value="">No inspections available</option>
                ) : (
                  inspections.map((insp) => (
                    <option key={insp.id} value={insp.id}>
                      {insp.location || insp.building_name || 'Inspection'}{' '}
                      ({insp.id.slice(0, 8)}) · {insp.status.toUpperCase()}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Start / End AR Session Button */}
        <div className="w-full shrink-0 md:w-auto">
          {isActive ? (
            <Button
              onClick={handleEnd}
              disabled={starting}
              variant="outline"
              className="w-full whitespace-normal text-xs font-black uppercase tracking-[0.15em] px-6 py-3 h-auto min-h-12 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 shadow-sm"
            >
              End AR Session
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={!inspectionId || starting}
              className="w-full whitespace-normal text-xs font-black uppercase tracking-[0.15em] px-6 py-3 h-auto min-h-12 rounded-xl shadow-lg shadow-primary/20"
            >
              {starting ? 'Starting camera…' : 'Start AR Session'}
            </Button>
          )}
        </div>
      </div>

      {/* Capability banner: this is camera AR with screen-space markers, not
          plane-locked spatial tracking, unless WebXR is genuinely available. */}
      {!bannerDismissed && (
        <div className="bg-sky-50/90 border border-sky-200/80 p-3.5 sm:p-4 rounded-lg flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div>
              <h4 className="text-[11px] sm:text-xs font-black text-sky-950 uppercase tracking-wider">
                Markers tied to printed references
              </h4>
              <p className="text-xs text-sky-800 font-medium mt-0.5 leading-relaxed">
                Print a reference target and attach it to the surface you are inspecting. Keep the
                target visible while aiming at points on that same flat surface. Tracking follows
                the printed target; it does not measure depth or assess structural safety.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="text-xs font-bold text-sky-600 hover:text-sky-800 p-1 rounded-lg min-h-[44px] min-w-[44px]"
            aria-label="Dismiss banner"
          >
            Dismiss
          </button>
        </div>
      )}

      {limitation && (
        <p
          role="status"
          className="text-xs font-semibold text-amber-800 bg-amber-50 p-3.5 rounded-xl border border-amber-200"
        >
          {limitation}
        </p>
      )}

      {startError && (
        <p
          role="alert"
          className="text-xs font-black text-red-600 bg-red-50 p-3.5 rounded-xl border border-red-100 uppercase tracking-wider"
        >
          {startError}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-xs font-black text-red-600 bg-red-50 p-3.5 rounded-xl border border-red-100 uppercase tracking-wider"
        >
          {error}
        </p>
      )}

      {/* Main AR Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_390px] gap-6 sm:gap-8 items-start">
        {/* An explicit height lets the h-full camera view fill the viewport on phones. */}
        <div
          id="ar-viewport"
          ref={viewportRef}
          className="relative h-[380px] min-h-[380px] sm:h-[520px] lg:h-[calc(100dvh-220px)] rounded-lg sm:rounded-lg overflow-hidden shadow-sm border border-slate-100 bg-slate-950"
        >
          <ARCameraView onTapToAnchor={handleTapToAnchor} onAimChange={setAim} aim={aim}
            frame={tracking.frame} viewport={tracking.viewport} placementPose={dbSessionId ? hitPose : null}
            trackingStatus={tracking.status} trackingMessage={tracking.message} placing={createARAnchor.isPending} />
          <AROverlay anchors={anchors} frame={tracking.frame} viewport={tracking.viewport} />
        </div>

        {/* Controls Column */}
        <div className="space-y-6">
          <ReferenceTargetControls inspectionId={inspectionId} anchors={anchors} />
          {markerError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{markerError}</p>}
          {isActive && dbSessionId && inspectionId && (
            <ARAnchorForm
              sessionId={dbSessionId}
              inspectionId={inspectionId}
              hitPose={hitPose}
              captureEvidence={captureEvidence}
            />
          )}

          {/* Persisted Spatial Anchors Card */}
          <div className="bg-white p-5 sm:p-6 rounded-lg sm:rounded-lg shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs sm:text-xs font-black text-slate-500 tracking-[0.2em] uppercase">
                Saved Markers
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-black text-xs">
                {anchors.length} Total
              </span>
            </div>

            {deleteARAnchor.isError && (
              <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-600">
                Could not delete this marker. Check your connection and permissions, then try again.
              </p>
            )}

            {anchors.length === 0 ? (
              <div className="text-center py-6 px-3 bg-slate-50/60 rounded-lg border border-dashed border-slate-200">
                <MapPin className="mx-auto mb-1 h-6 w-6 text-slate-500" aria-hidden="true" />
                <p className="text-xs sm:text-xs text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
                  No markers saved for this inspection. Print a reference target, start a session and scan it to place a marker.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {anchors.map((anchor) => {
                  const reference = getValidReference(anchor.pose)
                  const snapshotUrl = anchor.image_url
                  const isDeleting = deletingAnchorId === anchor.id

                  return (
                    <div
                      key={anchor.id}
                      className="bg-slate-50 hover:bg-slate-100/80 border border-slate-100 rounded-lg p-3 flex items-center justify-between gap-3 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {snapshotUrl ? (
                          <img
                            src={snapshotUrl}
                            alt={anchor.label}
                            className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-200/60 flex items-center justify-center text-lg shrink-0">
                            <MapPin className="h-5 w-5 text-slate-500" aria-hidden="true" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">
                            {anchor.label}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                              {anchor.damage_type ?? 'structural'}
                            </span>
                            {anchor.severity && <SeverityBadge severity={anchor.severity} />}
                          </div>
                          <div className="text-[8.5px] font-mono text-slate-500 mt-1 tabular-nums">
                            {reference
                              ? `Reference: ${reference.target.label} · ${reference.target.id.slice(0, 8)}`
                              : 'Legacy marker — no printed reference'}
                          </div>
                        </div>
                      </div>

                      {anchor.snapshot_path && <DeepAnalysisButton anchorId={anchor.id} />}

                      {/* Delete Anchor Action */}
                      <button
                        type="button"
                        onClick={() => handleDeleteAnchor(anchor.id)}
                        disabled={deleteARAnchor.isPending}
                        aria-busy={isDeleting}
                        className="text-slate-500 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
                        title="Delete marker"
                        aria-label={`Delete marker ${anchor.label}`}
                      >
                        {isDeleting ? (
                          <span className="text-xs animate-spin">⏳</span>
                        ) : (
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReferenceARPage() {
  return (
    <ARSessionManager>
      <Suspense
        fallback={
          <div className="bg-white p-6 sm:p-10 rounded-lg sm:rounded-lg shadow-sm h-96 animate-pulse border border-slate-100">
            <div className="h-6 bg-slate-100 rounded w-1/3 mb-4" />
          </div>
        }
      >
        <ARPageContent />
      </Suspense>
    </ARSessionManager>
  )
}

export default function ARPage() {
  const [mode, setMode] = useState<'markerless' | 'reference'>('markerless')
  const [active, setActive] = useState(false)
  return <div className="space-y-4">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="group" aria-label="Inspection tracking method">
      <button type="button" aria-pressed={mode === 'markerless'} disabled={active}
        onClick={() => setMode('markerless')} className="min-h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white disabled:opacity-60">Markerless / photo inspection</button>
      <button type="button" aria-pressed={mode === 'reference'} disabled={active}
        onClick={() => setMode('reference')} className="min-h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-white disabled:opacity-60">Printed reference (optional)</button>
    </div>
    {mode === 'markerless' ? <MarkerlessInspection onActiveChange={setActive} /> : <ReferenceARPage />}
  </div>
}
