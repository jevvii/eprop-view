'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useCallback } from 'react'
import { ARSessionManager, useARSessionContext } from '@/components/ar/ar-session-manager'
import { ARUnsupportedNotice } from '@/components/ar/ar-unsupported-notice'
import { ARCameraView } from '@/components/ar/ar-camera-view'
import { AROverlay } from '@/components/ar/ar-overlay'
import { ARAnchorForm } from '@/components/ar/ar-anchor-form'
import { useARAnchors } from '@/app/lib/queries'
import { useStartARSession, useEndARSession } from '@/app/lib/mutations'
import { Button } from '@/components/ui/button'

function ARPageContent() {
  const searchParams = useSearchParams()
  const inspectionId = searchParams.get('inspectionId') || ''
  const { supported, session, error, startSession: startWebXR, endSession: endWebXR } = useARSessionContext()
  const { data: anchors = [] } = useARAnchors(inspectionId || undefined)
  const startARSession = useStartARSession()
  const endARSession = useEndARSession()
  const [dbSessionId, setDbSessionId] = useState<string | null>(null)

  const handleStart = useCallback(async () => {
    if (!inspectionId) return
    await startWebXR()
    const created = await startARSession.mutateAsync({ inspectionId })
    setDbSessionId(created.id)
  }, [inspectionId, startWebXR, startARSession])

  const handleEnd = useCallback(async () => {
    endWebXR()
    if (dbSessionId) {
      await endARSession.mutateAsync({ sessionId: dbSessionId, inspectionId })
      setDbSessionId(null)
    }
  }, [dbSessionId, endWebXR, endARSession, inspectionId])

  if (supported === false) {
    return <ARUnsupportedNotice />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-2">
        <div>
          <h2 className="text-2xl font-koulen text-primary tracking-wide uppercase">AR Inspection Mode</h2>
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div className="relative h-[500px] lg:h-[calc(100vh-240px)] rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100">
          <ARCameraView />
          <AROverlay anchors={anchors} />
        </div>

        <div className="space-y-6">
          {session && dbSessionId && inspectionId && (
            <ARAnchorForm sessionId={dbSessionId} inspectionId={inspectionId} />
          )}

          <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100">
            <h4 className="text-[10px] font-black text-slate-400 tracking-[0.2em] uppercase mb-4">Persisted Anchors</h4>
            {anchors.length === 0 ? (
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">No AR anchors saved yet.</p>
            ) : (
              <div className="space-y-3">
                {anchors.map((anchor) => (
                  <div
                    key={anchor.id}
                    className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-[10px] font-black text-slate-700 uppercase tracking-wider">{anchor.label}</div>
                      <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                        {anchor.damage_type ?? 'unknown'} · {anchor.severity ?? 'unspecified'}
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
