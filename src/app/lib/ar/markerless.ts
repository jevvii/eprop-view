import { z } from 'zod'
import type { ARPose, Vector3 } from '@/app/types'

export const sessionTrackingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('webxr-session-v1'), sessionKey: z.string().uuid(), localId: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('camera-frame-v1'), sessionKey: z.string().uuid(),
    point: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict(),
  }).strict(),
])

export function isCurrentXRMarker(pose: ARPose, sessionKey: string): boolean {
  const parsed = sessionTrackingSchema.safeParse(pose.sessionTracking)
  return parsed.success && parsed.data.kind === 'webxr-session-v1' && parsed.data.sessionKey === sessionKey
}

export function projectXRPoint(position: Vector3, view: ArrayLike<number>, projection: ArrayLike<number>) {
  if (view.length !== 16 || projection.length !== 16) return null
  const multiply = (m: ArrayLike<number>, v: number[]) => [0, 1, 2, 3].map((row) =>
    m[row] * v[0] + m[row + 4] * v[1] + m[row + 8] * v[2] + m[row + 12] * v[3])
  const camera = multiply(view, [position.x, position.y, position.z, 1])
  if (camera.some((n) => !Number.isFinite(n)) || camera[2] >= 0) return null
  const clip = multiply(projection, camera)
  if (clip.some((n) => !Number.isFinite(n)) || clip[3] <= 0) return null
  const [x, y, z] = clip.map((n) => n / clip[3])
  if (Math.abs(x) > 1 || Math.abs(y) > 1 || Math.abs(z) > 1) return null
  return { x: (x + 1) / 2, y: (1 - y) / 2, distance: Math.hypot(camera[0], camera[1], camera[2]) }
}
