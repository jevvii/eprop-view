import type jsQR from 'jsqr'
import {
  decodeReferenceTarget, getReferenceHomography, getReferencePose,
  type Point2D, type Size2D,
} from './printed-reference'
import type { ARPose } from '@/app/types'

export interface ReferenceEvidence { pose: ARPose; snapshotDataUrl: string }

/** Detect and place against the same immutable camera pixels that become evidence. */
export function captureReferenceEvidence(
  video: HTMLVideoElement,
  inspectionId: string,
  aim: Point2D,
  viewport: Size2D,
  decodeQR: typeof jsQR,
): ReferenceEvidence | null {
  if (video.paused || video.readyState < 2 || !video.videoWidth || !video.videoHeight || document.hidden) return null
  const photo = document.createElement('canvas')
  photo.width = video.videoWidth
  photo.height = video.videoHeight
  const context = photo.getContext('2d')
  if (!context) return null
  context.drawImage(video, 0, 0)
  const sample = document.createElement('canvas')
  const scale = Math.min(1, 720 / Math.max(photo.width, photo.height))
  sample.width = Math.round(photo.width * scale)
  sample.height = Math.round(photo.height * scale)
  const sampleContext = sample.getContext('2d', { willReadFrequently: true })
  if (!sampleContext) return null
  sampleContext.drawImage(photo, 0, 0, sample.width, sample.height)
  const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height)
  const code = decodeQR(pixels.data, sample.width, sample.height, { inversionAttempts: 'dontInvert' })
  const target = code && decodeReferenceTarget(code.data, inspectionId)
  if (!code || !target) return null
  const point = (p: Point2D) => ({ x: p.x / scale, y: p.y / scale })
  const corners = { topLeft: point(code.location.topLeftCorner), topRight: point(code.location.topRightCorner),
    bottomRight: point(code.location.bottomRightCorner), bottomLeft: point(code.location.bottomLeftCorner) }
  const homography = getReferenceHomography(corners)
  if (!homography) return null
  const pose = getReferencePose(aim, { target, corners, homography,
    imageWidth: photo.width, imageHeight: photo.height, observedAt: performance.now() }, viewport)
  return pose ? { pose, snapshotDataUrl: photo.toDataURL('image/jpeg', .85) } : null
}
