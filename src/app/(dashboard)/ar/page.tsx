'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useCallback, useEffect } from 'react'
import { ARSessionManager, useARSessionContext } from '@/components/ar/ar-session-manager'
import { ARUnsupportedNotice } from '@/components/ar/ar-unsupported-notice'
import { ARCameraView } from '@/components/ar/ar-camera-view'
import { AROverlay } from '@/components/ar/ar-overlay'
import { ARAnchorForm } from '@/components/ar/ar-anchor-form'
import { useARAnchors, useProfile } from '@/app/lib/queries'
import { hasCapability } from '@/app/lib/role-utils'
import { AccessDenied } from '@/components/shared/require-role'
import { useStartARSession, useEndARSession, useCreateARAnchor } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'

function ARPageContent() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const searchParams = useSearchParams()
  const inspectionId = searchParams.get('inspectionId') || ''
  const { supported, session, error, hitPose, startSession: startWebXR, endSession: endWebXR } = useARSessionContext()
  const { data: anchors = [] } = useARAnchors(inspectionId || undefined)
  const startARSession = useStartARSession()
  const endARSession = useEndARSession()
  const createARAnchor = useCreateARAnchor()
  const [dbSessionId, setDbSessionId] = useState<string | null>(null)
  const [nativeInfo, setNativeInfo] = useState<{ available: boolean; engine: string; platform: string }>({
    available: false,
    engine: 'WebXR',
    platform: 'web',
  })
  const [detectedPlanesCount, setDetectedPlanesCount] = useState<number>(0)

  const canUseAR = hasCapability(profile?.role, 'ar:use')

  // Check for Capacitor native ARKit/ARCore bridge
  useEffect(() => {
    let unsubscribe = () => {}
    import('@/app/lib/ar/native-bridge').then(({ isNativeARAvailable, onARBridgeEvent }) => {
      isNativeARAvailable().then((res) => {
        setNativeInfo(res)
      })

      unsubscribe = onARBridgeEvent((event) => {
        if (event.type === 'planeDetected') {
          setDetectedPlanesCount((c) => c + 1)
        }
      })
    })

    return () => unsubscribe()
  }, [])

  if (profileLoading) {
    return <div className="bg-white p-10 rounded-[2.5rem] shadow-xl h-80 animate-pulse border border-slate-100 mx-2" />
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

  const handleStart = useCallback(async () => {
    if (!inspectionId) return
    let createdSessionId: string | null = null
    try {
      // 1. Create DB session row first
      const created = await startARSession.mutateAsync({
        inspectionId,
        deviceInfo: {
          engine: nativeInfo.engine,
          platform: nativeInfo.platform,
        },
      })
      createdSessionId = created.id
      setDbSessionId(created.id)

      // 2. Start native session if on Capacitor, or WebXR
      const { startNativeARSession } = await import('@/app/lib/ar/native-bridge')
      await startNativeARSession(inspectionId)
      await startWebXR()
    } catch (err) {
      console.error('AR session start failure:', err)
      // Cleanup orphaned DB session if start fails
      if (createdSessionId) {
        setDbSessionId(null)
        try {
          await endARSession.mutateAsync({ sessionId: createdSessionId, inspectionId })
        } catch (cleanupErr) {
          console.warn('Failed to cleanup orphaned AR session:', cleanupErr)
        }
      }
    }
  }, [inspectionId, startARSession, startWebXR, endARSession, nativeInfo])

  const handleEnd = useCallback(async () => {
    if (dbSessionId) {
      const currentId = dbSessionId
      setDbSessionId(null)
      try {
        await endARSession.mutateAsync({ sessionId: currentId, inspectionId })
      } catch (err) {
        console.warn('DB session end update failed:', err)
      }
    }
    const { stopNativeARSession } = await import('@/app/lib/ar/native-bridge')
    await stopNativeARSession()
    await endWebXR()
    setDetectedPlanesCount(0)
  }, [dbSessionId, endARSession, endWebXR, inspectionId])

  const handleTapToAnchor = useCallback(async () => {
    if (!session || !dbSessionId || !inspectionId) return
    if (!hitPose) {
      console.warn('Cannot place anchor: scanning surface...')
      return
    }

    try {
      await createARAnchor.mutateAsync({
        sessionId: dbSessionId,
        inspectionId,
        label: `Quick Marker ${anchors.length + 1}`,
        pose: hitPose,
        damageType: 'crack',
        severity: 'medium',
        notes: 'Placed via direct reticle tap in AR mode.',
      })
    } catch (err) {
      console.error('Failed to quick-place anchor:', err)
    }
  }, [session, dbSessionId, inspectionId, hitPose, anchors.length, createARAnchor])

  if (supported === false) {
    return <ARUnsupportedNotice />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">AR Inspection Mode</h2>
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              ⚡ {nativeInfo.engine}
            </span>
            {detectedPlanesCount > 0 && (
              <span className="text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">
                {detectedPlanesCount} Planes Tracked
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            {inspectionId
              ? `Live surface tracking for inspection ${inspectionId.slice(0, 8)}…`
              : 'Select an inspection from the document vault to begin AR tagging.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {session ? (
            <Button
              onClick={handleEnd}
              variant="outline"
              className="text-[9px] font-black uppercase tracking-[0.2em] px-5 py-3 h-auto"
            >
              End AR Session
            </Button>
          ) : (
            <Button
              onClick={handleStart}
              disabled={!inspectionId || supported === null || startARSession.isPending}
              className="text-[9px] font-black uppercase tracking-[0.2em] px-5 py-3 h-auto"
            >
              {supported === null ? 'Checking WebXR…' : startARSession.isPending ? 'Starting…' : 'Start AR Session'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-[9px] font-black text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 uppercase tracking-wider">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        <div className="relative h-[500px] lg:h-[calc(100vh-240px)] rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 bg-slate-950">
          <ARCameraView onTapToAnchor={handleTapToAnchor} />
          <AROverlay anchors={anchors} />
        </div>

        <div className="space-y-6">
          {session && dbSessionId && inspectionId && (
            <ARAnchorForm
              sessionId={dbSessionId}
              inspectionId={inspectionId}
              hitPose={hitPose}
            />
          )}

          <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase">Persisted Spatial Anchors</h4>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[9px]">
                {anchors.length} Total
              </span>
            </div>

            {anchors.length === 0 ? (
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                No AR anchors saved yet for this inspection. Point at a surface and submit the form above to lock an anchor.
              </p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {anchors.map((anchor) => (
                  <div
                    key={anchor.id}
                    className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-[10px] font-black text-slate-800 uppercase tracking-wider">
                        📍 {anchor.label}
                      </div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                        {anchor.damage_type ?? 'structural'} · {anchor.severity ?? 'unspecified'}
                      </div>
                      <div className="text-[8px] font-mono text-slate-400 mt-1">
                        [{anchor.pose?.position?.x?.toFixed(2) ?? '0'}, {anchor.pose?.position?.y?.toFixed(2) ?? '0'}, {anchor.pose?.position?.z?.toFixed(2) ?? '0'}]
                      </div>
                    </div>
                  </div>
                ))}
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
          <div className="bg-white p-10 rounded-[2.5rem] shadow-xl h-96 animate-pulse border border-slate-100">
            <div className="h-6 bg-slate-100 rounded w-1/3 mb-4"></div>
          </div>
        }
      >
        <ARPageContent />
      </Suspense>
    </ARSessionManager>
  )
}
