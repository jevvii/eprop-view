'use client'

import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'

interface XRSessionState {
  supported: boolean | null
  session: XRSession | null
  error: string | null
  startSession: () => Promise<void>
  endSession: () => void
}

const ARSessionContext = createContext<XRSessionState | undefined>(undefined)

export function useARSessionContext() {
  const ctx = useContext(ARSessionContext)
  if (!ctx) throw new Error('useARSessionContext must be used inside ARSessionManager')
  return ctx
}

interface ARSessionManagerProps {
  children: ReactNode
  onStarted?: () => void
  onEnded?: () => void
}

export function ARSessionManager({ children, onStarted, onEnded }: ARSessionManagerProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [session, setSession] = useState<XRSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const xr = navigator.xr
    if (!xr) {
      setSupported(false)
      return
    }

    xr.isSessionSupported('immersive-ar')
      .then((ok) => setSupported(ok))
      .catch(() => setSupported(false))
  }, [])

  const startSession = async () => {
    setError(null)
    if (!navigator.xr) {
      setError('WebXR not available')
      return
    }

    try {
      const xrSession = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body },
      } as XRSessionInit)

      xrSession.addEventListener('end', () => {
        setSession(null)
        onEnded?.()
      })

      setSession(xrSession)
      onStarted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start AR session')
    }
  }

  const endSession = () => {
    session?.end()
  }

  return (
    <ARSessionContext.Provider
      value={{
        supported,
        session,
        error,
        startSession,
        endSession,
      }}
    >
      {children}
    </ARSessionContext.Provider>
  )
}
