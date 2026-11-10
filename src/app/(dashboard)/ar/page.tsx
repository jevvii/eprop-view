'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { ARSessionManager, useARSessionContext } from '@/components/ar/ar-session-manager'
import { ARCameraView } from '@/components/ar/ar-camera-view'
import { AROverlay } from '@/components/ar/ar-overlay'
import { ARAnchorForm } from '@/components/ar/ar-anchor-form'
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
    xrHardwareSupported,
    activeMode,
    isActive,
    error,
    limitation,
    hitPose,
    startSession: startProgressiveAR,
    endSession: endProgressiveAR,
  } = useARSessionContext()

  const { data: anchors = [] } = useARAnchors(inspectionId || undefined)
  const startARSession = useStartARSession()
  const endARSession = useEndARSession()
  const createARAnchor = useCreateARAnchor()
  const deleteARAnchor = useDeleteARAnchor()

  const [dbSessionId, setDbSessionId] = useState<string | null>(null)
  const dbSessionIdRef = useRef<string | null>(null)
  const [deletingAnchorId, setDeletingAnchorId] = useState<string | null>(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [nativeInfo, setNativeInfo] = useState<{ available: boolean; engine: string; platform: string }>({
    available: false,
    engine: 'Progressive AR',
    platform: 'web',
  })
  const [detectedPlanesCount, setDetectedPlanesCount] = useState<number>(0)

  const canUseAR = hasCapability(profile?.role, 'ar:use')

  // Check for Capacitor native ARKit/ARCore bridge
  useEffect(() => {
    let unsubscribe: (() => void) | null = null
    let cancelled = false

    import('@/app/lib/ar/native-bridge').then(({ isNativeARAvailable, onARBridgeEvent }) => {
      // The component may unmount before the dynamic import resolves.
      if (cancelled) return

      isNativeARAvailable().then((res) => {
        if (!cancelled) setNativeInfo(res)
      })

      unsubscribe = onARBridgeEvent((event) => {
        if (event.type === 'planeDetected') {
          setDetectedPlanesCount((c) => c + 1)
        }
      })
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  // Reattach to an already-active DB session instead of leaking it and
  // creating a second row on the next Start.
  useEffect(() => {
    if (!inspectionId) return
    let cancelled = false

    getActiveARSession(inspectionId)
      .then((active) => {
        if (cancelled || !active) return
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
    return () => {
      const sessionToClose = dbSessionIdRef.current
      dbSessionIdRef.current = null
      if (sessionToClose) {
        void endARSession
          .mutateAsync({ sessionId: sessionToClose, inspectionId })
          .catch((err) => console.error('Failed to close AR session on unmount:', err))
      }
    }
  }, [endARSession, inspectionId])

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

  const handleStart = useCallback(async () => {
    if (!inspectionId) return
    let createdSessionId: string | null = null
    try {
      // Reuse the rehydrated session instead of inserting a duplicate row.
      if (!dbSessionIdRef.current) {
        const created = await startARSession.mutateAsync({
          inspectionId,
          deviceInfo: {
            engine: nativeInfo.platform !== 'web' ? nativeInfo.engine : xrHardwareSupported ? 'WebXR' : 'Optical Camera',
            platform: nativeInfo.platform,
          },
        })
        createdSessionId = created.id
        dbSessionIdRef.current = created.id
        setDbSessionId(created.id)
      }

      const isNativeDevice = nativeInfo.platform !== 'web'
      if (isNativeDevice) {
        const { startNativeARSession, requestNativeCameraPermission } = await import(
          '@/app/lib/ar/native-bridge'
        )
        const granted = await requestNativeCameraPermission()
        if (!granted) {
          throw new Error('Camera permission was denied')
        }
        await startNativeARSession(inspectionId)
      } else {
        await startProgressiveAR()
      }
    } catch (err) {
      console.error('AR session start failure:', err)
      if (createdSessionId) {
        dbSessionIdRef.current = null
        setDbSessionId(null)
        try {
          await endARSession.mutateAsync({ sessionId: createdSessionId, inspectionId })
        } catch (cleanupErr) {
          console.error('Failed to clean up orphaned AR session:', cleanupErr)
        }
      }
    }
  }, [
    inspectionId,
    startARSession,
    xrHardwareSupported,
    nativeInfo,
    startProgressiveAR,
    endARSession,
  ])

  const handleEnd = useCallback(async () => {
    const currentId = dbSessionIdRef.current
    dbSessionIdRef.current = null
    setDbSessionId(null)

    if (currentId) {
      try {
        await endARSession.mutateAsync({ sessionId: currentId, inspectionId })
      } catch (err) {
        console.error('DB session end update failed:', err)
      }
    }

    if (nativeInfo.platform !== 'web') {
      try {
        const { stopNativeARSession } = await import('@/app/lib/ar/native-bridge')
        await stopNativeARSession()
      } catch (err) {
        console.error('Native AR stop failed:', err)
      }
    }

    await endProgressiveAR()
    setDetectedPlanesCount(0)
  }, [endARSession, nativeInfo.platform, endProgressiveAR, inspectionId])

  const handleTapToAnchor = useCallback(async () => {
    if (!isActive || !dbSessionId || !inspectionId) return
    if (!hitPose) {
      return
    }

    try {
      await createARAnchor.mutateAsync({
        sessionId: dbSessionId,
        inspectionId,
        label: `Marker ${anchors.length + 1}`,
        pose: hitPose,
        damageType: 'none',
        notes: 'Marker placed from the viewport reticle. No defect classification was made.',
      })
    } catch (err) {
      console.error('Failed to place marker:', err)
    }
  }, [isActive, dbSessionId, inspectionId, hitPose, anchors.length, createARAnchor])

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
      <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-3xl shadow-xl h-80 animate-pulse border border-slate-100 mx-2" />
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
      <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-md border border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-koulen text-primary tracking-wide uppercase">
              AR Inspection Mode
            </h2>
            <span className="text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {xrHardwareSupported
                ? 'WebXR (hit-test)'
                : activeMode !== 'idle'
                  ? activeMode === 'optical-camera'
                    ? 'Camera + screen markers'
                    : 'Simulated grid'
                  : 'Camera + screen markers'}
            </span>
            {detectedPlanesCount > 0 && (
              <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {detectedPlanesCount} plane{detectedPlanesCount === 1 ? '' : 's'} detected
              </span>
            )}
          </div>

          {/* In-Page Inspection Selector Dropdown */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <label
              htmlFor="ar-inspection-select"
              className="text-xs font-black uppercase tracking-wider text-slate-500 shrink-0"
            >
              Inspection:
            </label>
            <div className="relative flex-1 max-w-md">
              <select
                id="ar-inspection-select"
                data-testid="ar-inspection-select"
                value={selectedInspectionId}
                onChange={(e) => handleInspectionChange(e.target.value)}
                disabled={isActive}
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
        <div className="flex items-center gap-3 shrink-0">
          {isActive ? (
            <Button
              onClick={handleEnd}
              variant="outline"
              className="text-xs font-black uppercase tracking-[0.15em] px-6 py-3 h-auto min-h-[44px] rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 shadow-sm"
            >
              End AR Session
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={!inspectionId || startARSession.isPending}
              className="text-xs font-black uppercase tracking-[0.15em] px-6 py-3 h-auto min-h-[44px] rounded-xl shadow-lg shadow-primary/20"
            >
              {startARSession.isPending ? 'Starting Engine…' : 'Start AR Session'}
            </Button>
          )}
        </div>
      </div>

      {/* Capability banner: this is camera AR with screen-space markers, not
          plane-locked spatial tracking, unless WebXR is genuinely available. */}
      {!xrHardwareSupported && !bannerDismissed && (
        <div className="bg-sky-50/90 border border-sky-200/80 p-3.5 sm:p-4 rounded-2xl flex items-start justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5 sm:gap-3">
            <div>
              <h4 className="text-[11px] sm:text-xs font-black text-sky-950 uppercase tracking-wider">
                Camera AR with screen-space markers
              </h4>
              <p className="text-xs text-sky-800 font-medium mt-0.5 leading-relaxed">
                This device does not expose WebXR hit-testing. The camera feed works, but depth is
                estimated at a fixed range and markers stay in screen space; they are not locked to a
                physical surface. Frame capture and heuristic analysis are available.
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
        {/* Camera & Spatial Viewport */}
        <div className="relative min-h-[380px] sm:h-[520px] lg:h-[calc(100dvh-220px)] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl border border-slate-100 bg-slate-950">
          <ARCameraView onTapToAnchor={handleTapToAnchor} />
          <AROverlay anchors={anchors} />
        </div>

        {/* Controls Column */}
        <div className="space-y-6">
          {isActive && dbSessionId && inspectionId && (
            <ARAnchorForm
              sessionId={dbSessionId}
              inspectionId={inspectionId}
              hitPose={hitPose}
            />
          )}

          {/* Persisted Spatial Anchors Card */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs sm:text-xs font-black text-slate-500 tracking-[0.2em] uppercase">
                Saved Markers
              </h4>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-black text-xs">
                {anchors.length} Total
              </span>
            </div>

            {anchors.length === 0 ? (
              <div className="text-center py-6 px-3 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <span className="text-2xl mb-1 block opacity-40">📍</span>
                <p className="text-xs sm:text-xs text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
                  No markers saved for this inspection. Start a session and tap the view to place one.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {anchors.map((anchor) => {
                  const snapshotUrl = anchor.image_url
                  const isDeleting = deletingAnchorId === anchor.id

                  return (
                    <div
                      key={anchor.id}
                      className="bg-slate-50 hover:bg-slate-100/80 border border-slate-100 rounded-2xl p-3 flex items-center justify-between gap-3 transition-colors"
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
                            📍
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
                          <div className="text-[8.5px] font-mono text-slate-400 mt-1 tabular-nums">
                            [{anchor.pose?.position?.x?.toFixed(2) ?? '0.00'},{' '}
                            {anchor.pose?.position?.y?.toFixed(2) ?? '0.00'},{' '}
                            {anchor.pose?.position?.z?.toFixed(2) ?? '0.00'}]
                          </div>
                        </div>
                      </div>

                      {/* Delete Anchor Action */}
                      <button
                        type="button"
                        onClick={() => handleDeleteAnchor(anchor.id)}
                        disabled={isDeleting}
                        className="text-slate-400 hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
                        title="Delete anchor"
                        aria-label={`Delete anchor ${anchor.label}`}
                      >
                        {isDeleting ? (
                          <span className="text-xs animate-spin">⏳</span>
                        ) : (
                          <span className="text-sm">🗑️</span>
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

export default function ARPage() {
  return (
    <ARSessionManager>
      <Suspense
        fallback={
          <div className="bg-white p-6 sm:p-10 rounded-2xl sm:rounded-3xl shadow-xl h-96 animate-pulse border border-slate-100">
            <div className="h-6 bg-slate-100 rounded w-1/3 mb-4" />
          </div>
        }
      >
        <ARPageContent />
      </Suspense>
    </ARSessionManager>
  )
}
