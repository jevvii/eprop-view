'use client'

import { useCallback, useState } from 'react'
import { analyzeCapturedFrame } from '@/app/actions/ai-frame'
import { useARSessionContext } from './ar-session-manager'
import type { DamageType, SeverityLevel } from '@/app/types'

/**
 * Frame capture and analysis, lifted out of the anchor form.
 *
 * Both actions belong next to the camera, not buried in a form further down the
 * page: an inspector aims, captures and analyses in one place. The form consumes
 * this state instead of owning it.
 */

export interface ARAnalysis {
  damageType: DamageType
  severity: SeverityLevel
  confidence: number
  notes: string
}

export interface ARCaptureState {
  snapshot: string | null
  setSnapshot: (value: string | null) => void
  analysis: ARAnalysis | null
  isScanning: boolean
  error: string | null
  evidenceUnavailable: boolean
  capture: () => string | null
  analyze: () => Promise<ARAnalysis | null>
}

const WEBXR_MESSAGE =
  'Immersive WebXR does not expose the camera frame. Switch to camera mode to capture evidence.'
const NO_CAMERA_MESSAGE = 'No camera frame is available. Start the camera first.'

export function useARCapture(inspectionId: string): ARCaptureState {
  const { captureCurrentFrame, activeMode } = useARSessionContext()
  const evidenceUnavailable = activeMode === 'webxr'

  const [snapshot, setSnapshot] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<ARAnalysis | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unavailableMessage = evidenceUnavailable ? WEBXR_MESSAGE : NO_CAMERA_MESSAGE

  const capture = useCallback((): string | null => {
    setError(null)
    const frame = captureCurrentFrame()
    if (!frame) {
      setError(unavailableMessage)
      return null
    }
    setSnapshot(frame)
    return frame
  }, [captureCurrentFrame, unavailableMessage])

  const analyze = useCallback(async (): Promise<ARAnalysis | null> => {
    setError(null)
    const frame = captureCurrentFrame()

    if (!frame) {
      setError(unavailableMessage)
      return null
    }

    setSnapshot(frame)
    setIsScanning(true)

    try {
      const result = await analyzeCapturedFrame({ inspectionId, dataUrl: frame })

      if (!result) {
        const none: ARAnalysis = {
          damageType: 'none',
          severity: 'low',
          confidence: 0,
          notes: 'Heuristic analysis: no defect pattern detected in this frame.',
        }
        setAnalysis(none)
        return none
      }

      const next: ARAnalysis = {
        damageType: result.damageType,
        severity: result.severity,
        confidence: result.confidence,
        notes: `Heuristic edge/colour analysis (non-ML): ${result.damageType} at ${(
          result.confidence * 100
        ).toFixed(0)}% confidence. Not a trained classifier.`,
      }
      setAnalysis(next)
      return next
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Frame analysis failed')
      return null
    } finally {
      setIsScanning(false)
    }
  }, [captureCurrentFrame, inspectionId, unavailableMessage])

  return {
    snapshot,
    setSnapshot,
    analysis,
    isScanning,
    error,
    evidenceUnavailable,
    capture,
    analyze,
  }
}
