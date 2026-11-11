'use client'

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type jsQR from 'jsqr'
import { captureReferenceEvidence } from '@/app/lib/ar/capture-reference'
import {
  decodeReferenceTarget, getReferenceHomography,
  type ReferenceTrackingFrame, type Size2D, type Point2D,
} from '@/app/lib/ar/printed-reference'

interface TrackingState {
  frame: ReferenceTrackingFrame | null
  status: 'idle' | 'searching' | 'tracking' | 'lost' | 'error'
  message: string | null
}
const EMPTY: TrackingState = { frame: null, status: 'idle', message: null }

export function useReferenceTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  viewportRef: RefObject<HTMLDivElement | null>,
  inspectionId: string,
  enabled: boolean,
) {
  const [state, setState] = useState<TrackingState>(EMPTY)
  const [viewport, setViewport] = useState<Size2D>({ width: 0, height: 0 })
  const decoderRef = useRef<typeof jsQR | null>(null)

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [viewportRef, enabled, inspectionId])

  useEffect(() => {
    if (!enabled || !inspectionId) {
      setState(EMPTY)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let previous: ReferenceTrackingFrame | null = null
    let hasTracked = false
    let lastVideoTime = -1
    setState({ frame: null, status: 'searching', message: null })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const clearTracking = (message: string | null = null) => {
      previous = null
      setState({ frame: null, status: hasTracked ? 'lost' : 'searching', message })
    }

    void import('jsqr').then(({ default: decodeQR }) => {
      if (cancelled) return
      decoderRef.current = decodeQR
      if (!context) {
        setState({ frame: null, status: 'error', message: 'This browser cannot read camera frames for target tracking.' })
        return
      }
      const scan = () => {
        if (cancelled) return
        const video = videoRef.current
        const now = performance.now()
        if (document.hidden || !video || video.paused || video.readyState < 2 || !video.videoWidth) {
          clearTracking()
        } else if (video.currentTime === lastVideoTime) {
          if (!previous || now - previous.observedAt > 300) clearTracking()
        } else {
          lastVideoTime = video.currentTime
          try {
            // Decode a bounded frame at ~7 fps; the original video remains the preview.
            const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
            const width = Math.round(video.videoWidth * scale), height = Math.round(video.videoHeight * scale)
            if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
            context.drawImage(video, 0, 0, width, height)
            const pixels = context.getImageData(0, 0, width, height)
            const code = decodeQR(pixels.data, width, height, { inversionAttempts: 'dontInvert' })
            const target = code ? decodeReferenceTarget(code.data, inspectionId) : null
            if (target && code) {
              const point = (p: { x: number; y: number }) => ({ x: p.x / scale, y: p.y / scale })
              const corners = { topLeft: point(code.location.topLeftCorner), topRight: point(code.location.topRightCorner),
                bottomRight: point(code.location.bottomRightCorner), bottomLeft: point(code.location.bottomLeftCorner) }
              const homography = getReferenceHomography(corners)
              if (homography) {
                previous = { target, corners, homography, imageWidth: video.videoWidth, imageHeight: video.videoHeight, observedAt: now }
                hasTracked = true
                setState({ frame: previous, status: 'tracking', message: null })
              } else clearTracking('Move closer and face the printed target more directly.')
            } else if (code) {
              clearTracking('Use an EPROPVIEW reference printed for the selected inspection.')
            } else if (!previous || now - previous.observedAt > 300) {
              clearTracking()
            }
          } catch {
            clearTracking('Camera frames are temporarily unavailable. Resume the camera to track the target.')
          }
        }
        timer = setTimeout(scan, 140)
      }
      scan()
    }).catch(() => {
      if (!cancelled) setState({ frame: null, status: 'error', message: 'Target tracking could not load. Reload and try again.' })
    })
    const onVisibilityChange = () => { if (document.hidden) clearTracking() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [videoRef, inspectionId, enabled])

  // Never expose the previous inspection's coordinate frame during an inspection switch.
  const frame = enabled && state.frame?.target.inspectionId === inspectionId ? state.frame : null
  const captureEvidence = useCallback((aim: Point2D) => {
    const video = videoRef.current
    const decoder = decoderRef.current
    if (!enabled || !video || !decoder) return null
    try {
      return captureReferenceEvidence(video, inspectionId, aim, viewport, decoder)
    } catch {
      return null
    }
  }, [enabled, videoRef, inspectionId, viewport])
  return { ...state, frame, viewport, captureEvidence }
}
