import type { Vector3, Quaternion, ARPose, DamageType, SeverityLevel } from '@/app/types'

export type ARBridgeEventType =
  | 'planeDetected'
  | 'anchorPlaced'
  | 'anchorUpdated'
  | 'sessionEnded'
  | 'trackingChanged'
  | 'error'

export interface ARBridgeEvent {
  type: ARBridgeEventType
  payload: Record<string, unknown>
}

export interface NativeARAnchor {
  nativeId: string
  position: Vector3
  quaternion: Quaternion
  damageType?: DamageType
  severity?: SeverityLevel
  label?: string
}

export interface NativePlane {
  id: string
  alignment: 'horizontal' | 'vertical' | 'any'
  center?: Vector3
  extentWidth: number
  extentHeight: number
}

export interface NativeARSessionOptions {
  enablePlaneDetection?: boolean
  enableLightEstimation?: boolean
  worldAlignment?: 'gravity' | 'gravityAndHeading'
}

export interface ARBridgePluginInterface {
  isAvailable: () => Promise<{
    available: boolean
    platform: 'ios' | 'android' | 'web'
    engine: 'ARKit' | 'ARCore' | 'WebXR' | 'mock'
    hasCameraPermission: boolean
  }>
  startSession: (options: { inspectionId: string } & NativeARSessionOptions) => Promise<{
    status: 'started'
    inspectionId: string
  }>
  placeAnchor: (options: {
    pose: ARPose
    metadata?: Record<string, unknown>
  }) => Promise<{ nativeId: string }>
  stopSession: () => Promise<{ status: 'stopped' }>
  captureSnapshot: () => Promise<{ dataUrl: string }>
  addListener: (
    eventName: string,
    listenerFunc: (event: any) => void
  ) => Promise<{ remove: () => void }>
}
